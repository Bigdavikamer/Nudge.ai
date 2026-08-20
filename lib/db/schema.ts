import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Phase 1 schema — the spine.
 *
 * Covers organizations, users, clients, invoices and events. The message,
 * thread and sequence tables designed in docs/PHASE-0.md §2.4–2.5 land in
 * Phase 2 alongside the scheduler that exercises them: a migration should
 * arrive with the code that uses it, or the two drift apart (D-020).
 *
 * Conventions
 *  - snake_case in the DB, camelCase in TS.
 *  - Every tenant-scoped row carries org_id, indexed, and is only reachable
 *    through lib/db/repos/*, which requires an org id in every signature.
 *  - Money is amount_minor BIGINT + ISO-4217 currency. Never a float (D-003).
 *  - Emails are stored lowercase; the repo layer normalises. No citext, so
 *    the same SQL runs on PGlite and Postgres unchanged (D-019).
 */

export const planEnum = pgEnum('plan', ['free', 'solo', 'team'])
export const userRoleEnum = pgEnum('user_role', ['owner', 'member'])
export const invoiceSourceEnum = pgEnum('invoice_source', ['manual', 'stripe', 'csv'])
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'open',
  'part_paid',
  'paid',
  'void',
  'written_off',
])
export const timezoneSourceEnum = pgEnum('timezone_source', ['explicit', 'country', 'org_default'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Null under the dev auth adapter; set once Clerk is configured. */
  clerkOrgId: text('clerk_org_id').unique(),
  name: text('name').notNull(),
  defaultTimezone: text('default_timezone').notNull().default('UTC'),
  defaultCountry: text('default_country'),
  plan: planEnum('plan').notNull().default('free'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  /** Our own billing. Never the ingest integration — separate modules (§4). */
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  /** The global kill switch. Set = nothing sends, for any client (flag 1.8). */
  chasePausedAt: timestamp('chase_paused_at', { withTimezone: true }),
  ...timestamps,
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id').unique(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: userRoleEnum('role').notNull().default('owner'),
    ...timestamps,
  },
  (t) => [index('users_org_idx').on(t.orgId)],
)

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    primaryEmail: text('primary_email').notNull(),
    ccEmails: text('cc_emails').array().notNull().default(sql`'{}'::text[]`),

    countryCode: text('country_code'),
    /** Resolution order and provenance per D-007; persisted so a mis-timed
     *  send is diagnosable after the fact. */
    timezone: text('timezone'),
    timezoneSource: timezoneSourceEnum('timezone_source').notNull().default('org_default'),

    /** Per-client auto-send, steps 1–4 only. Enforced in the guard (Phase 2). */
    autoSendEnabled: boolean('auto_send_enabled').notNull().default(false),
    neverChase: boolean('never_chase').notNull().default(false),

    /** Reliability score: median days late over the last 6 settled invoices.
     *  Internal only — never rendered into copy the user might forward (§2.6). */
    medianDaysLate: numeric('median_days_late', { precision: 6, scale: 2 }),
    reliabilitySampleSize: integer('reliability_sample_size').notNull().default(0),

    /** { stripe: "cus_..." } — the dedupe key when a source is connected. */
    externalIds: jsonb('external_ids').$type<Record<string, string>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('clients_org_email_uq').on(t.orgId, t.primaryEmail),
    index('clients_org_idx').on(t.orgId),
  ],
)

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),

    source: invoiceSourceEnum('source').notNull().default('manual'),
    externalId: text('external_id'),

    invoiceNumber: text('invoice_number').notNull(),
    currency: text('currency').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    // sql`0` rather than 0n: drizzle-kit serialises the snapshot as JSON and
    // JSON.stringify cannot represent a BigInt literal.
    amountPaidMinor: bigint('amount_paid_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),

    status: invoiceStatusEnum('status').notNull().default('open'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentUrl: text('payment_url'),

    /** Quoted verbatim by the drafter, or not at all. Never computed (flag 1.8). */
    lateFeeTerms: text('late_fee_terms'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    // The manual-vs-source dedupe keys (Phase 5 relies on both).
    uniqueIndex('invoices_source_external_uq')
      .on(t.orgId, t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
    uniqueIndex('invoices_number_uq').on(t.orgId, t.clientId, t.invoiceNumber),
    index('invoices_aging_idx').on(t.orgId, t.status, t.dueDate),
    index('invoices_client_idx').on(t.clientId),
  ],
)

// ---------------------------------------------------------------------------
// Append-only event log
// ---------------------------------------------------------------------------

/**
 * "Recovered this month" is a sum over invoice.paid events in a date range,
 * not a recomputation over mutable invoice rows. If someone un-marks an
 * invoice as paid, the recovery history stays truthful about what happened.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    type: text('type').$type<EventType>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    /** User id, or a system actor like "stripe.webhook". */
    actor: text('actor').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_org_time_idx').on(t.orgId, t.occurredAt),
    index('events_invoice_idx').on(t.invoiceId),
    index('events_recovery_idx').on(t.orgId, t.type, t.occurredAt),
  ],
)

/** Free text in the DB, a closed union in TS — new types need no migration. */
export type EventType =
  | 'invoice.created'
  | 'invoice.updated'
  | 'invoice.paid'
  | 'invoice.part_paid'
  | 'invoice.unpaid'
  | 'invoice.voided'
  | 'invoice.written_off'
  | 'client.created'
  | 'client.updated'
  | 'chase.paused'
  | 'chase.resumed'

// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect
export type User = typeof users.$inferSelect
export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type EventRow = typeof events.$inferSelect
