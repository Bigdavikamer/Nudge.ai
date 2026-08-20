import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../index'
import { clients, events, invoices, type EventType } from '../schema'
import { agingPhrase, bandFor, daysLate } from '../../aging'
import { formatDateLong, formatDateShort, type IsoDate } from '../../dates'
import { fractionDigits, formatMoney, formatMoneyCompact, money } from '../../money'
import type { InvoiceDetail, InvoiceListItem, InvoiceStatus, TimelineEntry } from '../../types'

/**
 * Invoice repository.
 *
 * Every function takes `orgId` first and filters on it. That is the whole
 * tenancy story at this layer — no ambient context, no request-scoped globals,
 * so a missing tenant filter is a compile error rather than a data leak.
 */

type InvoiceRow = typeof invoices.$inferSelect
type ClientRow = typeof clients.$inferSelect

const OPEN_STATUSES: InvoiceStatus[] = ['open', 'part_paid']

function toListItem(invoice: InvoiceRow, client: ClientRow, today: IsoDate): InvoiceListItem {
  const amount = money(invoice.amountMinor, invoice.currency)
  const outstanding = money(invoice.amountMinor - invoice.amountPaidMinor, invoice.currency)
  const late = daysLate(invoice.dueDate, today)
  const settled = invoice.status === 'paid'

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    clientId: client.id,
    clientName: client.name,

    currency: invoice.currency,
    amountMinor: invoice.amountMinor.toString(),
    majorUnits: Number(invoice.amountMinor) / 10 ** fractionDigits(invoice.currency),
    amountLabel: formatMoney(amount),
    amountCompact: formatMoneyCompact(amount),
    outstandingLabel: formatMoney(outstanding),

    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    dueLabel: formatDateShort(invoice.dueDate),

    status: invoice.status,
    daysLate: late,
    band: settled ? 'paid' : bandFor(late),
    agingPhrase: settled ? 'paid' : agingPhrase(late),
    paidAtLabel: invoice.paidAt ? formatDateShort(isoFromInstant(invoice.paidAt)) : null,
  }
}

function isoFromInstant(d: Date): IsoDate {
  return d.toISOString().slice(0, 10)
}

export async function listInvoices(
  orgId: string,
  today: IsoDate,
  opts: { status?: 'open' | 'paid' | 'all'; clientId?: string } = {},
): Promise<InvoiceListItem[]> {
  const db = await getDb()
  const filters = [eq(invoices.orgId, orgId)]
  if (opts.clientId) filters.push(eq(invoices.clientId, opts.clientId))
  if (opts.status === 'open') filters.push(inArray(invoices.status, OPEN_STATUSES))
  if (opts.status === 'paid') filters.push(eq(invoices.status, 'paid'))

  const rows = await db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(...filters))
    .orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber))

  return rows.map((r) => toListItem(r.invoice, r.client, today))
}

export async function getInvoice(
  orgId: string,
  id: string,
  today: IsoDate,
): Promise<InvoiceDetail | null> {
  const db = await getDb()
  const [row] = await db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
    .limit(1)

  if (!row) return null

  const timeline = await listTimeline(orgId, id)
  return {
    ...toListItem(row.invoice, row.client, today),
    clientEmail: row.client.primaryEmail,
    issueLabel: formatDateLong(row.invoice.issueDate),
    dueLabelLong: formatDateLong(row.invoice.dueDate),
    paymentUrl: row.invoice.paymentUrl,
    lateFeeTerms: row.invoice.lateFeeTerms,
    notes: row.invoice.notes,
    timeline,
  }
}

const TIMELINE_TITLES: Record<string, string> = {
  'invoice.created': 'Invoice created',
  'invoice.updated': 'Invoice edited',
  'invoice.paid': 'Marked paid',
  'invoice.part_paid': 'Part payment recorded',
  'invoice.unpaid': 'Marked unpaid',
  'invoice.voided': 'Voided',
  'invoice.written_off': 'Written off',
  'chase.paused': 'Chase paused',
  'chase.resumed': 'Chase resumed',
}

async function listTimeline(orgId: string, invoiceId: string): Promise<TimelineEntry[]> {
  const db = await getDb()
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId), eq(events.invoiceId, invoiceId)))
    .orderBy(desc(events.occurredAt))

  return rows.map((e) => ({
    id: e.id,
    type: e.type,
    title: TIMELINE_TITLES[e.type] ?? e.type,
    detail: typeof e.payload.note === 'string' ? e.payload.note : null,
    at: e.occurredAt.toISOString(),
    atLabel: new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(e.occurredAt),
  }))
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type CreateInvoiceInput = {
  clientName: string
  clientEmail: string
  invoiceNumber: string
  currency: string
  amountMinor: bigint
  issueDate: IsoDate
  dueDate: IsoDate
  paymentUrl?: string | null
  lateFeeTerms?: string | null
  notes?: string | null
}

export class DuplicateInvoiceNumberError extends Error {
  constructor(invoiceNumber: string, clientName: string) {
    super(`${clientName} already has an invoice numbered ${invoiceNumber}.`)
    this.name = 'DuplicateInvoiceNumberError'
  }
}

export async function createInvoice(
  orgId: string,
  actor: string,
  input: CreateInvoiceInput,
): Promise<{ id: string }> {
  const db = await getDb()
  const email = input.clientEmail.trim().toLowerCase()

  const client = await upsertClient(orgId, { name: input.clientName.trim(), email })

  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        eq(invoices.clientId, client.id),
        eq(invoices.invoiceNumber, input.invoiceNumber.trim()),
      ),
    )
    .limit(1)
  if (existing.length > 0) {
    throw new DuplicateInvoiceNumberError(input.invoiceNumber.trim(), client.name)
  }

  const [created] = await db
    .insert(invoices)
    .values({
      orgId,
      clientId: client.id,
      source: 'manual',
      invoiceNumber: input.invoiceNumber.trim(),
      currency: input.currency.toUpperCase(),
      amountMinor: input.amountMinor,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      paymentUrl: input.paymentUrl?.trim() || null,
      lateFeeTerms: input.lateFeeTerms?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: invoices.id })

  if (!created) throw new Error('Invoice insert returned no row.')

  await recordEvent(orgId, actor, 'invoice.created', {
    invoiceId: created.id,
    clientId: client.id,
    payload: {
      invoiceNumber: input.invoiceNumber.trim(),
      amountMinor: input.amountMinor.toString(),
      currency: input.currency.toUpperCase(),
      source: 'manual',
    },
  })

  return { id: created.id }
}

export async function upsertClient(
  orgId: string,
  input: { name: string; email: string },
): Promise<ClientRow> {
  const db = await getDb()
  const email = input.email.trim().toLowerCase()

  const [existing] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.primaryEmail, email)))
    .limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(clients)
    .values({ orgId, name: input.name, primaryEmail: email })
    .returning()
  if (!created) throw new Error('Client insert returned no row.')

  await recordEvent(orgId, 'system', 'client.created', {
    clientId: created.id,
    payload: { name: created.name, email },
  })
  return created
}

/**
 * Mark paid. Writes the amount into the event payload rather than leaving the
 * recovery figure to be recomputed from the invoice row later — if someone
 * un-marks this tomorrow, what was recovered today stays true (schema §events).
 */
export async function markPaid(
  orgId: string,
  id: string,
  actor: string,
  paidAt: Date,
): Promise<void> {
  const db = await getDb()
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
    .limit(1)
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'paid') return

  await db
    .update(invoices)
    .set({
      status: 'paid',
      paidAt,
      amountPaidMinor: invoice.amountMinor,
      updatedAt: paidAt,
    })
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))

  await recordEvent(orgId, actor, 'invoice.paid', {
    invoiceId: id,
    clientId: invoice.clientId,
    occurredAt: paidAt,
    payload: {
      invoiceNumber: invoice.invoiceNumber,
      amountMinor: invoice.amountMinor.toString(),
      currency: invoice.currency,
      daysToPay: daysLate(invoice.issueDate, isoFromInstant(paidAt)),
    },
  })
}

export async function markUnpaid(orgId: string, id: string, actor: string): Promise<void> {
  const db = await getDb()
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
    .limit(1)
  if (!invoice || invoice.status !== 'paid') return

  await db
    .update(invoices)
    .set({ status: 'open', paidAt: null, amountPaidMinor: 0n })
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))

  await recordEvent(orgId, actor, 'invoice.unpaid', {
    invoiceId: id,
    clientId: invoice.clientId,
    payload: { invoiceNumber: invoice.invoiceNumber },
  })
}

export async function deleteInvoice(orgId: string, id: string): Promise<void> {
  const db = await getDb()
  await db.delete(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
}

export async function recordEvent(
  orgId: string,
  actor: string,
  type: EventType,
  opts: {
    invoiceId?: string
    clientId?: string
    occurredAt?: Date
    payload?: Record<string, unknown>
  } = {},
): Promise<void> {
  const db = await getDb()
  await db.insert(events).values({
    orgId,
    actor,
    type,
    invoiceId: opts.invoiceId ?? null,
    clientId: opts.clientId ?? null,
    payload: opts.payload ?? {},
    ...(opts.occurredAt ? { occurredAt: opts.occurredAt } : {}),
  })
}

export async function countOpenInvoices(orgId: string): Promise<number> {
  const db = await getDb()
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, OPEN_STATUSES)))
  return row?.n ?? 0
}
