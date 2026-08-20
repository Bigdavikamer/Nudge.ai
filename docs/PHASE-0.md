# Phase 0 — Plan

Nudge: the collections layer on top of the invoicing tool you already use.

Scope confirmed as written in the brief. Nothing in §7 is being smuggled in. This document
is data model, adapter interfaces, wireframes, the design plan, and a critique of that plan
against §3 — plus, first, the things I think are wrong.

---

## 1. Things I think are wrong, in priority order

### 1.1 Phase 3 has a calendar-time dependency that engineering cannot compress

Gmail's `gmail.send`, `gmail.readonly`, and `gmail.modify` are **restricted scopes**. Publishing
an app that uses them requires Google's OAuth verification *plus* an annual third-party CASA
security assessment. Until that clears, the app is capped at 100 test users and shows an
unverified-app interstitial. The assessment costs real money and the review is measured in
weeks, sometimes months, and it is not a queue you can engineer your way to the front of.

Phase 3 is described as "the first version that recovers real money". As sequenced, Phase 3
completes and then sits blocked behind a Google review that has not been started.

**Proposal.** Two changes, no scope loss:

1. **SMTP + IMAP is the v1 primary, not the fallback.** Sending via the user's own SMTP
   (app password, or their provider's host) needs no Google review, and it satisfies every
   requirement that actually matters in §2.5: it comes from their address, their domain's
   deliverability, replies land in their inbox. Reply detection uses IMAP polling of the
   sent-thread's `Message-ID` rather than Gmail watch/history — slower (a 2–5 minute poll
   instead of a push) but it needs no Pub/Sub and no restricted scope. The pause-on-reply
   rule tolerates minutes of latency; nothing in the ladder fires that fast.
2. **Start the Google verification application during Phase 1**, in parallel, so Gmail API
   lands as an upgrade in Phase 5 or 6 rather than as a blocker in Phase 3.

The `MailTransport` / `MailInbox` split below makes Gmail a drop-in later. This is the one
flag I would push back on twice if overruled.

> **Resolved — SMTP + IMAP first (D-015).** Phase 3 builds against SMTP. The Google
> verification application is a Phase 1 task so Gmail can land in Phase 5–6 as an upgrade
> behind the same two interfaces.

### 1.2 The first thing the product does could be a Final Notice blast

Phase 5 ingests Stripe history. A Stripe account has invoices that are 90, 200, 400 days
overdue — written off, disputed, from clients who left, from a bookkeeping era the user has
mentally closed. If those land in an `active` sequence, the ladder places them at step 5 or 6
immediately, and the user's introduction to Nudge is a wave of cold, formal collections mail
sent from their own address to people they may have long since settled with offline.

This is not a bug we can fix after launch. It is a one-shot reputational event per customer.

**Proposal (D-013).** Any invoice arriving via import or sync whose due date is more than
14 days past starts in `paused_manual`, never `active`. The onboarding screen lists them as
"Not chasing yet — 23 older invoices" with per-row and bulk opt-in. Cheap to build, and it
also becomes a good onboarding moment: the user is *choosing* who to chase.

### 1.3 The consolidation rule leaks the final-notice guarantee

§2.2 says a client with three overdue invoices gets one consolidated email, and separately
that the final notice never auto-sends. Those two rules collide: if invoice A is at step 3
(auto-sendable) and invoice B has reached step 6, a consolidated automated message either
drags B's final notice out through an automated path, or silently downgrades B's escalation.

**Proposal (D-009).** An invoice at step 5 or 6 is *excluded from consolidation entirely* and
routes to the manual queue as its own message. The consolidated automated message covers only
steps 1–4 and takes the tone of the **most escalated invoice it actually contains**. A client
can therefore receive one automated consolidated nudge and, separately, a human-approved firm
notice — which is correct behaviour, not a bug: those are different acts.

Corollary the brief does not state: after a consolidated send, **every** invoice in
`message_invoices` must have its step advanced and its `next_run_at` recomputed, or the
uncovered ones re-fire the next morning and the 48-hour cap eats them silently forever.

### 1.4 "One email per invoice per client per 48 hours" contradicts itself

As literally written, "per invoice per client" permits one email per invoice, which is the
opposite of consolidation. The intent is clearly **one outbound email per client per 48 hours**,
counted across all their invoices. I am building that. Flagging because the wording will
otherwise get re-litigated in a code review three weeks from now.

### 1.5 "Recipient-local timezone" is mostly unknowable, so AC#5 as written is untestable

Stripe customers do not carry a timezone. CSV exports do not. Manual entry could ask, but
asking for a client's timezone during a four-minute onboarding (AC#1) is exactly the friction
that kills activation. In practice we will know a country code sometimes and nothing often.

**Proposal (D-007).** Resolution order: explicit `client.timezone` → country code mapped to a
representative IANA zone → `org.default_timezone`. The resolved zone *and its provenance*
persist on every message. AC#5 restates as: *no email sends outside 08:00–17:00 in the
resolved zone, on a weekend in the resolved zone, or within 48 hours of the previous send to
that client.* That version is provable. The original is not.

Same problem, smaller: public holidays vary by region within a country (US states, German
Länder, UK nations). v1 does national-level only, best-effort, and degrades to "send anyway"
when the country is unknown. Weekend and business hours are hard; holidays are soft.

### 1.6 AC#2 is not an acceptance criterion

"A draft a real freelancer would send without editing at least half the time" cannot gate a
build. **Proposal:** split it.

- *CI gate (blocking):* a fixed eval set of ~30 invoice scenarios × ladder steps, scored by an
  assertion suite — no apology phrases from the banned list, no fact outside the provided
  fields, subject line contains invoice number and correctly formatted amount, valid JSON on
  first parse ≥ 95% of runs, tone matches requested step.
- *Product metric (not a gate):* `unedited_send_rate` on the dashboard from day one. The 50%
  target is measured against real users post-launch, where it belongs.

### 1.7 The edit-feedback loop will drift if applied naively

"Every edit is fed back into the voice profile" describes a system training on its own output.
Two or three cycles and the descriptor collapses toward whatever phrasing happened to survive
early edits.

**Proposal (D-010).** Edits are stored as evidence. The voice profile is **re-derived**
on a schedule from the last N *sent* messages (approved-as-is and edited alike, edited ones
weighted higher), never incrementally mutated per edit. The resulting descriptor is shown to
the user in settings, in plain language, and is editable. If they see "you write short,
contraction-heavy sentences and sign off with 'Cheers'" they can correct it. That visibility
is also a better demo than the loop itself.

### 1.8 Smaller ones

- **No global kill switch.** Add `organizations.chase_paused_at` and `clients.never_chase`.
  A collections tool without a big stop button is a liability the first time a client dies,
  disputes, or goes into administration.
- **Late fees.** "Cites late-fee clause if one exists" needs a field to cite. Adding
  `invoices.late_fee_terms` (free text). The drafter may quote it verbatim and may never
  compute, infer, or invent one.
- **Deliverability of the heads-up step.** Step 1 emails clients who are not late at all. On
  by default for every client, it roughly doubles outbound volume for zero recovery on the
  ~71% of invoices that were always going to be paid on time. I would ship it **default-off
  for the first invoice with a new client, default-on afterwards** — it is a courtesy to
  someone you already have a payment relationship with, and spam to someone you do not.
  Easy to change; flagging the reasoning.
  > **Resolved — on for everyone, including a client's first invoice (D-016).** Building it
  > that way. It stays per-client editable, sits inside the 48-hour cap and the consolidation
  > rule, and `heads_up` open and reply rates are instrumented from Phase 3 so the default
  > gets revisited against data.
- **Lighthouse ≥ 90 with Clerk + PostHog + Sentry** is achievable but not free. Third-party
  scripts load post-hydration behind `next/script` `afterInteractive`, PostHog via reverse
  proxy, Sentry with a trimmed bundle. Budgeted in Phase 6, tracked from Phase 1.
- **The numbers in §1 of the brief** I am taking as given; they motivate the product but no
  code depends on them. Worth a source link in the marketing copy later, not now.

Not flagged because I agree: sending from the user's mailbox is the right call, and it has a
second benefit the brief does not mention — a creditor collecting its own debt in its own name
sits well clear of third-party debt-collector rules in most jurisdictions, which sending from
`@nudge.ai` would start to blur. (Not legal advice; worth a real opinion before launch.)

---

## 2. Data model

Postgres + Drizzle. `snake_case` in the DB, `camelCase` in TS. Every table carries `id uuid pk
default gen_random_uuid()`, `created_at`, `updated_at`. Every tenant-scoped table carries
`org_id` with an index, and every query goes through a scoped repository that requires it.

### 2.1 Tenancy and identity

```
organizations
  clerk_org_id text unique
  name, default_timezone text, default_country char(2)
  plan enum(free|solo|team), trial_ends_at timestamptz
  stripe_customer_id, stripe_subscription_id        -- OUR billing, never ingest
  chase_paused_at timestamptz                       -- global kill switch (1.8)

users
  clerk_user_id text unique, org_id fk, email, name
  role enum(owner|member)

voice_profiles
  org_id fk, user_id fk null                        -- org default + per-user override
  descriptor jsonb        -- {register, greeting, signoff, avg_sentence_len,
                          --  contractions: bool, emoji: none|sparing, quirks: string[]}
  derived_from_message_ids uuid[], derived_at timestamptz
  user_edited bool        -- true once a human touches it; re-derivation then
                          -- proposes rather than overwrites
  -- raw pasted emails are NEVER stored (§2.3)
```

### 2.2 Mail

```
mailboxes
  org_id fk
  provider enum(smtp|gmail)
  email_address citext, display_name
  smtp_host, smtp_port, smtp_username, smtp_secret_ref   -- ref into secret store, not the secret
  imap_host, imap_port, imap_username, imap_secret_ref
  oauth_token_ref                                        -- gmail, later
  status enum(pending|verified|failing|revoked), last_error
  last_poll_at, last_seen_uid bigint                     -- IMAP cursor
```

Secrets are stored as references (env-keyed KMS or Vercel/Neon-side encryption), never as
columns in plaintext. `smtp_secret_ref` resolution lives behind one function so it can be
swapped without touching callers.

### 2.3 The domain

```
clients
  org_id fk, name, primary_email citext, cc_emails citext[]
  country_code char(2) null, timezone text null, timezone_source enum(explicit|country|org_default)
  auto_send_enabled bool default false        -- per-client, steps 1–4 only (§2.4)
  never_chase bool default false
  median_days_late numeric null               -- reliability score, last 6 invoices
  reliability_sample_size int
  external_ids jsonb                          -- {stripe: "cus_..."} — dedupe key for sources
  unique (org_id, primary_email)

invoices
  org_id fk, client_id fk
  source enum(manual|stripe|csv), external_id text null
  invoice_number text, currency char(3), amount_minor bigint, amount_paid_minor bigint default 0
  issue_date date, due_date date
  status enum(open|paid|part_paid|void|written_off)
  paid_at timestamptz null, payment_url text null
  late_fee_terms text null                    -- quoted verbatim or not at all (1.8)
  notes text
  unique (org_id, source, external_id) where external_id is not null
  unique (org_id, client_id, invoice_number)  -- the manual-vs-Stripe dedupe key (Phase 5)
  index (org_id, status, due_date)
```

`amount_minor` + `currency`, never a float (D-003). Mixed-currency totals render as separate
figures per currency; nothing is ever summed across currencies (§7 forbids FX).

### 2.4 The ladder

```
sequence_templates
  org_id fk, name, is_default bool

sequence_steps
  template_id fk, ordinal int
  key enum(heads_up|due_today|nudge_1|nudge_2|firm|final)
  offset_days int                 -- relative to due_date; negative = before
  tone text                       -- fed to the drafter
  auto_send_allowed bool          -- FALSE for firm and final, and not user-settable (§2.4)

chase_sequences
  org_id fk, invoice_id fk unique, template_id fk
  state enum(active|paused_reply|paused_manual|completed|stopped_paid|stopped_void)
  current_step_ordinal int, next_run_at timestamptz null, index (next_run_at) where state='active'
  paused_reason text, paused_at timestamptz
```

`auto_send_allowed = false` on `firm` and `final` is enforced by a **DB check constraint**, not
by application code — AC#6 says final notices cannot be sent by any automated path, and a
constraint is the only version of that claim a future contributor cannot accidentally undo.

### 2.5 Messages — where consolidation lives

```
threads
  org_id fk, client_id fk
  root_rfc822_id text          -- Message-ID of the first outbound
  subject_root text
  last_outbound_at, last_inbound_at timestamptz

messages
  org_id fk, client_id fk, thread_id fk, mailbox_id fk
  direction enum(outbound|inbound)
  status enum(draft|approved|scheduled|sending|sent|failed|cancelled|superseded)
  step_key text null                       -- most-escalated step in the message
  subject, body_text, body_html
  generated_by enum(template|claude|human), model text null
  tone_used text, confidence numeric null
  scheduled_for timestamptz, resolved_timezone text, timezone_source text
  sent_at timestamptz, rfc822_message_id text, in_reply_to text, references text[]
  provider_message_id text, error text
  index (org_id, client_id, sent_at desc)  -- the 48-hour cap reads this

message_invoices                            -- D-004: many-to-many. The whole trick.
  message_id fk, invoice_id fk, step_key text
  primary key (message_id, invoice_id)

message_edits                               -- feedback signal (§2.4)
  message_id fk, edited_by fk
  original_subject, original_body_text, final_subject, final_body_text
  diff jsonb, created_at
```

### 2.6 Plumbing

```
events              org_id, invoice_id null, client_id null, type, payload jsonb, occurred_at
                    -- append-only. Powers the invoice timeline AND "recovered this month"
                    -- (sum of invoice.paid events in range), so the KPI is never a
                    -- recomputation of mutable state.

webhook_events      provider, external_id unique, payload jsonb, received_at, processed_at
                    -- idempotency. Stripe redelivers; we must not re-chase or double-count.

imports             org_id, kind enum(csv), filename, column_map jsonb, row_count,
                    accepted, rejected, created_at
import_rows         import_id, line_no, raw jsonb, parsed jsonb, error text, invoice_id null

holidays_cache      country_code, date, name, primary key (country_code, date)
```

---

## 3. Adapter interfaces

Everything in `/lib/adapters/`. Every one has a `Fake*` sibling in `/lib/adapters/fakes/` used
by the whole test suite. No test touches a real network.

```ts
// clock.ts — D-006. new Date() is banned outside this file (ESLint rule).
export interface Clock { now(): Date }

// invoice-source.ts — Stripe today, QuickBooks/Xero slot in later without a rewrite (§2.1)
export interface InvoiceSource {
  readonly id: 'manual' | 'stripe' | 'csv'
  listClients(cursor?: string): Promise<Page<SourceClient>>
  listInvoices(opts: { since?: Date; cursor?: string }): Promise<Page<SourceInvoice>>
  getInvoice(externalId: string): Promise<SourceInvoice | null>
  verifyWebhook(req: RawRequest): Promise<boolean>
  parseWebhook(req: RawRequest): Promise<SourceEvent[]>
}
export type SourceEvent =
  | { type: 'invoice.paid';    externalId: string; paidAt: Date; amountPaidMinor: bigint }
  | { type: 'invoice.voided';  externalId: string }
  | { type: 'invoice.updated'; externalId: string; patch: Partial<SourceInvoice> }
  | { type: 'payment.failed';  externalId: string; reason: string }

// mail-transport.ts — SMTP now, Gmail later (1.1)
export interface MailTransport {
  readonly provider: 'smtp' | 'gmail'
  send(msg: OutboundMessage): Promise<SendReceipt>   // returns rfc822MessageId
  verify(): Promise<MailboxHealth>
}

// mail-inbox.ts — IMAP poll now, Gmail history later
export interface MailInbox {
  poll(cursor: InboxCursor): Promise<{ messages: InboundMessage[]; cursor: InboxCursor }>
}

// drafter.ts — TemplateDrafter (Phase 2) → ClaudeDrafter (Phase 4), same interface
export interface Drafter {
  draft(ctx: DraftContext): Promise<Draft>   // {subject, bodyText, bodyHtml, toneUsed, confidence}
}

// holidays.ts (D-008), billing.ts, analytics.ts, errors.ts — same shape: narrow, fakeable.
```

`ClaudeDrafter` hardening, per §2.3: strip fences → `JSON.parse` → Zod schema → on failure,
one retry with the parse error appended to the prompt → on second failure, `TemplateDrafter`
for that step, and an event logged. The user never sees a send fail because of malformed JSON.
The Anthropic call is the only place model IDs appear, and it uses the current Claude model.

---

## 4. The scheduler core

The single most important design decision in the product (D-005). Every rule in §2.2 lives in
one **pure function** with no IO:

```ts
type GuardInput = {
  now: Date
  org:    { pausedAt: Date | null; timezone: string; entitlements: Entitlements }
  client: { neverChase: boolean; autoSend: boolean; timezone: string;
            timezoneSource: 'explicit'|'country'|'org_default'; countryCode: string | null }
  lastOutboundAt: Date | null            // to this client, any invoice
  lastInboundAt:  Date | null
  candidates: Array<{ invoiceId: string; stepKey: StepKey; dueAt: Date; amountMinor: bigint }>
  holidays: ReadonlySet<string>          // yyyy-mm-dd in the resolved zone
}

type GuardDecision =
  | { kind: 'send';    invoiceIds: string[]; stepKey: StepKey; autoSend: boolean }
  | { kind: 'queue';   invoiceIds: string[]; stepKey: StepKey; reason: 'needs_approval' }
  | { kind: 'defer';   until: Date; reason: 'quiet_hours'|'weekend'|'holiday'|'rate_cap' }
  | { kind: 'suppress'; reason: 'paused_reply'|'paused_org'|'never_chase'|'plan_limit'|'paid' }

export function decide(input: GuardInput): GuardDecision
```

Order of evaluation, which is itself the specification:

1. `suppress` — org paused, client `never_chase`, invoice paid/void, plan limit reached.
2. `suppress: paused_reply` — `lastInboundAt` after the last outbound.
3. Split candidates: steps 5–6 leave the consolidation set (1.3) and become their own
   `queue` decisions, always, regardless of `autoSend`.
4. `defer: rate_cap` — `now - lastOutboundAt < 48h`.
5. Resolve the send window in the client's zone: weekend → defer to Monday 08:00; holiday →
   defer to the next business day; outside 08:00–17:00 → defer to the next 08:00 within the
   window. Deferral is idempotent — running the guard twice returns the same instant.
6. Consolidate the remainder into one message, `stepKey` = most escalated present.
7. `send` if `client.autoSend` and every step is auto-sendable; otherwise `queue`.

Inngest calls this and does what it says. Inngest is never where a rule lives. That is what
makes AC#5 provable: the 20+ scheduler tests in Phase 2 are pure function calls with a frozen
clock — no database, no queue, no network, milliseconds to run.

The 48-hour cap additionally takes a Postgres advisory lock keyed on `client_id` around the
send transaction, because two Inngest workers picking up two invoices for one client at the
same instant is a real race and the pure guard cannot see it.

---

## 5. Wireframes

### 5.1 Dashboard

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ NUDGE     Dashboard   Queue (7)   Invoices   Clients                [+ Invoice]  (DB) │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  RECOVERED THIS MONTH          CASH AT RISK      AVG DAYS TO PAY     OLDEST OPEN      │
│                                                                                       │
│   $18,430                      $42,110           31.4                68 days          │
│   ───────────                  ───────           ────                ───────          │
│   6 invoices, Aug              11 invoices       last 6 months       1042 · Northwind │
│                                                                                       │
├── AGING RAIL ─────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│   NOT DUE       │ 1–14 LATE          │ 15–34 LATE        │ 35+ LATE                   │
│                 │                    │                   │                            │
│      ░   ░░     │   ▪   ▪▪▪▪    ▪    │    ▮     ▮▮       │   ▓          ▓▓▓      ▓    │
│   ░      ░      │      ▪     ▪       │       ▮           │        ▓                   │
│  ═══════════════╪════════════════════╪═══════════════════╪══════════════════════════  │
│  −14d      0d   │  +3   +7      +14  │  +21       +34    │  +45    +60    +90   90d+  │
│                                                                                       │
│                    ┌─ 1042 · Northwind Ltd ──────────────────────┐                    │
│                    │ $2,400.00 USD  ·  due 12 Aug  ·  9 days late │  ← hover          │
│                    │ ✓ Heads-up    9 Aug    ✓ Due today  12 Aug   │                   │
│                    │ ✓ Nudge 1    15 Aug    → Nudge 2  22 Aug 09:00                   │
│                    └─────────────────────────────────────────────┘                    │
├───────────────────────────────────────────────────────────────────────────────────────┤
│  NEEDS YOU                                  │  SLOWEST PAYERS                         │
│  ─────────                                  │  ──────────────                         │
│  3 drafts waiting          [Review →]       │  Kestrel Design     +22d median         │
│  1 reply from Halden Co    [Read →]         │  Northwind Ltd      +14d median         │
│  1 final notice needs you  [Review →]       │  Halden Co           +9d median         │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Chip width encodes amount (clamped 8–48px so a $40 invoice stays clickable and a $90k one
does not eat the band). Position within band is linear by days; the 35+ band compresses
beyond +90d and pins anything older to the right edge with a hard stop mark. Bands are
labelled in text — colour is never the only signal.

### 5.2 Approval queue

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│  QUEUE                                        7 waiting  ·  [Approve all safe (4)]    │
├──────────────────────────┬────────────────────────────────────────────────────────────┤
│ ▸ Northwind Ltd          │  To: ap@northwind.example                                  │
│   Nudge 2 · $2,400       │  Subject: Invoice 1042 — $2,400.00 — 9 days overdue        │
│   sends 22 Aug 09:00     │  ────────────────────────────────────────────────────────  │
│                          │                                                             │
│ ▸ Kestrel Design      ◆  │  Hi Ana,                                                    │
│   Nudge 1 · 3 invoices   │                                                             │
│   $8,150 total           │  Invoice 1042 for $2,400.00 was due on 12 August and is     │
│   sends 22 Aug 08:00     │  still showing as unpaid. Payment terms are net 14.         │
│                          │                                                             │
│ ▸ Halden Co         ⚑    │  You can pay it here: [link]                                │
│   FINAL · $12,900        │                                                             │
│   manual send only       │  Thanks,                                                    │
│                          │  Davi                                                       │
│ ▸ Orrin & Sons           │  ────────────────────────────────────────────────────────  │
│   Due today · $640       │  Covers: 1042                                               │
│                          │  Voice: matches your usual · Confidence 0.86                │
│                          │                                                             │
│                          │  [Send now]  [Edit]  [Skip this step]  [Pause client]       │
└──────────────────────────┴────────────────────────────────────────────────────────────┘
     ◆ consolidated        ⚑ needs a human, always
```

Mobile: the list becomes a single-card stack, one draft filling the viewport, `Send` and
`Edit` as a fixed bottom bar, swipe between drafts. Fully operable one-handed (§3).
"Approve all safe" excludes anything flagged ⚑ — it can never batch a final notice.

### 5.3 Invoice detail

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│  ← Invoices                                                                            │
│                                                                                        │
│  1042 · Northwind Ltd                                    [Mark paid]  [Pause chase]    │
│  $2,400.00 USD                                                                         │
│  issued 29 Jul  ·  due 12 Aug  ·  9 days late  ·  net 14                               │
│  ▓▓▓▓▓▓▓▓▓▓▓▓ 1–14 LATE                                                                │
│                                                                                        │
│  CHASE                                              CLIENT                             │
│  ─────                                              ──────                             │
│  ✓  Heads-up      9 Aug  09:04   opened             Northwind Ltd                      │
│  ✓  Due today    12 Aug  08:12   opened             ap@northwind.example               │
│  ✓  Nudge 1      15 Aug  09:00   no reply           GB · Europe/London (from country)  │
│  →  Nudge 2      22 Aug  09:00   scheduled          median +14d over 6 invoices        │
│     Firm          2 Sep          needs approval     auto-send: on (steps 1–4)          │
│     Final notice 16 Sep          manual only ⚑                                         │
│                                                                                        │
│  ACTIVITY                                                                              │
│  ─────────                                                                             │
│  15 Aug 09:00  Sent "Invoice 1042 — $2,400.00 — 3 days overdue"          [View]        │
│  15 Aug 08:58  Draft edited by Davi — 2 changes                          [Diff]        │
│  12 Aug 08:12  Sent "Invoice 1042 — $2,400.00 — due today"               [View]        │
│  29 Jul 14:20  Invoice created — manual entry                                          │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Design plan

Tokens are in `styles/tokens.css`; that file is the only place a hex literal may appear, and
Phase 1 adds a lint rule that enforces it.

**The world.** Ledger paper, not fintech. Surfaces step *up* toward white rather than down
toward grey, so panels read as sheets stacked on a desk. Radii are 2–6px — paper has cut
edges. Rules are hairlines. Elevation is a 1px contact shadow, never a glow, never a gradient.
The one flourish is the rail.

**Type.** Keeping the three suggested faces, with reasons: Bricolage Grotesque is a variable
grotesque with genuine width and optical-size axes — character without tipping into the
broadsheet-serif look §3 bans. Inter Tight is neutral and narrow enough that dense tables stay
readable. JetBrains Mono has a slashed zero and an unmistakable 1/l/I, which is what you want
when someone is reading an invoice number back over the phone. All three self-host via
`next/font`; no external font requests, which also protects the Lighthouse budget.

**Aging Rail mechanics.**

- Four fixed bands; within a band, linear position by days late; beyond +90d, compressed and
  pinned. An unbounded linear axis would put a 400-day invoice off-screen and squash
  everything that matters into the left 5%.
- Density: chips collide by design. Within a band, chips lay out on up to 3 rows with a
  greedy packer, ordered by amount descending. Past 3 rows, the overflow collapses into a
  single `+12` cluster chip that opens a filtered list. The rail must stay readable for a
  bookkeeper with 200 open invoices, and must not silently hide money.
- **Zero CLS (AC#8):** the rail reserves `--rail-height: 148px` server-side and renders a
  skeleton of band labels and the axis immediately. Chips animate `transform` and `opacity`
  only — never `left`, `width`, or anything that reflows.
- Entry: staggered 18ms, 400ms each, from the axis upward. `prefers-reduced-motion` collapses
  duration and stagger to ~0 via token override — chips simply exist.
- **Paid:** the chip detaches, rotates ~8°, falls past the axis with `--ease-drop`, fades over
  700ms; the surviving chips re-pack with a FLIP transform. Simultaneously "Recovered this
  month" ticks up. Reduced motion gets a 150ms fade and the same tick. This is the moment the
  product is selling; it gets real effort in Phase 6 and a Playwright assertion that it fires.

**Copy.** Same verb through a flow (Send → Sending → Sent). Sentence case. Empty queue reads
"Nothing to chase. Everything's either paid or not due yet." Errors name the thing and the
fix: "Northwind's mail server rejected the message (mailbox full). Try again in an hour or
send from your own client." Never "Something went wrong."

---

## 7. Critique of my own design plan against §3

Honest version, including the parts I have not solved.

**7.1 The rail is a bar chart wearing a costume.** Positioned by X, sized by amount — that is
a scatter plot. If it is only decoration above the real UI, it is exactly the kind of
signature element that gets removed in v2. The mitigation is that it must be the *primary
navigation* of the dashboard: hover is the chase history, click is the invoice, and there is
no separate "open invoices" table competing with it on the same screen. If in Phase 1 I find
myself building a table underneath it that does the same job better, the rail has failed and
I should say so rather than keep it for the pitch.

**7.2 The palette has a measured accessibility hole.** Computed against `--paper` (#EDF0EF):

| Token | Ratio on paper | Text? |
|---|---|---|
| `--ink-900` | 15.44:1 | yes |
| `--oxblood-800` | 11.06:1 | yes |
| `--pine-700` | 7.06:1 | yes |
| `--rust-600` | 6.13:1 | yes |
| `--slate-600` | 5.81:1 | yes |
| `--amber-500` | **2.02:1** | **no** |
| `--mint-300` | **1.57:1** | **no** |

So the two colours carrying "recently late" and "paid" — the optimistic half of the aging
scale — cannot legally be text on the app background. Taken naively, the brand fails WCAG AA
at exactly the two states the product most wants to celebrate. Fix (D-011): amber and mint are
**fills and marks only**; text uses `--amber-800` (4.83:1) and `--mint-800` (5.83:1), which
keep the hue and the meaning. Ink on amber measures 7.63:1 and ink on mint 9.86:1, so chips
with labels are comfortable. The aging scale survives intact; it just gets two more tokens.

**7.3 The rail's mint→oxblood bleed is one step from a banned gradient.** §3 bans
gradient-on-glass, and "visually bleeds from mint to oxblood" invites exactly that. Explicit
rule: the bleed is an emergent property of discrete chip fills across the bands. There is no
gradient fill anywhere in the product — not on the rail background, not on a card, not on a
button. If the bands need separating, they get a hairline and a label.

**7.4 A colour-only aging scale excludes colour-blind users.** Amber→rust→oxblood is a
red-yellow ramp; deuteranopia and protanopia flatten it substantially. Every chip therefore
carries its day count on hover and in its accessible name, every band is labelled in text, and
band membership is also encoded by *row position* within the rail, not colour alone. In
forced-colors mode chips fall back to border weight plus label.

**7.5 The banned list has one item I need to argue with.** "`01 / 02 / 03` numbered markers
anywhere they aren't a genuine sequence" — the chase ladder is a genuine sequence, and users
will say "she's on nudge two". So steps are numbered in the UI. I am reading the ban as
aimed at decorative numbering, not at ordinals that carry meaning. Say so if you disagree.

**7.6 Where I might drift into the default AI-app look anyway.** The risks are: a KPI row of
four rounded cards with muted labels (looks like every SaaS dashboard ever); an empty state
with a centred line-art illustration; a settings page of unstyled toggle rows. My guard is
that the KPI row is **not cards** — it is four figures sitting directly on paper, separated by
rules, with "Recovered this month" set materially larger in the display face, the way the top
line of a statement is. Whether that reads as disciplined or as unfinished I genuinely will
not know until it is on screen in Phase 1; it is the first thing I would want your eyes on.

**7.7 The mono-for-all-data rule will fight the display face.** Both dashboard KPIs and table
cells are "data". If KPIs are mono they lose all character; if they are display they may lack
`tnum` and jitter as figures change. Plan: KPIs in Bricolage with `font-variant-numeric:
tabular-nums`, verified in Phase 1 — if the face lacks the feature, KPI numerals fall back to
JetBrains Mono at display size and the display face keeps the page titles only.

**7.8 Two things §3 does not specify that I am choosing.** No dark mode in v1 (D-012) — the
aging scale is a light-paper system and a dark inversion needs a second scale designed from
scratch, which is a Phase 7 project. And density: the app is set at a comfortable default with
a compact toggle deferred, because the bookkeeper persona with 200 invoices will want compact
and I would rather learn that from a real one than guess now.

---

## 8. Test plan

| Layer | Tool | What it covers |
|---|---|---|
| Guard | Vitest | 20+ cases in Phase 2: weekend, holiday, quiet hours, DST transitions in both directions, 47h59m vs 48h01m, consolidation with mixed steps, step-5 exclusion, paused-on-reply, plan limit, idempotent deferral |
| Money | Vitest | minor-unit arithmetic, zero-decimal currencies (JPY), no cross-currency summation |
| CSV | Vitest | the messy-export corpus from §2.1 — `1,234.00`, `$`, both date orders, blank rows, BOM, CRLF |
| Drafter | Vitest | banned-apology assertions, no-invented-facts, subject format, malformed-JSON retry then template fallback |
| Flows | Playwright | connect→schedule→approve→send; reply→pause; paid→stop (AC#7) |
| Perf | Lighthouse CI | dashboard ≥ 90, CLS 0 on the rail (AC#8) |

Fixed clock everywhere. `MAIL_MODE=sandbox` outside production, transport throws on
non-allowlisted recipients (D-014).

---

## 9. Phase 1 exit criteria

Auth, schema, manual entry, invoice list, the Aging Rail on real data. No email, no AI.
Genuinely usable as a manual tracker: I could track my own receivables in it for a week.
Plus: tokens wired, hex-literal lint rule live, `Clock` injected, seed script in
`/scripts/seed.ts`, Lighthouse baseline recorded.

---

## 10. Questions

**Answered.**

1. **Name and home** — product is **Nudge**, repo is `C:\Users\Pichau\Documents\Nudge.ai`.
   Wordmark is "Nudge", domain is nudge.ai (D-001).
2. **Mail path** — SMTP + IMAP first, Google verification started in Phase 1 (D-015).
3. **Heads-up default** — on for everyone, first invoice included (D-016).

**Still open, not blocking Phase 1.**

4. Do the chase-ladder step numbers survive the `01 / 02 / 03` ban (7.5)? I am reading that
   ban as aimed at decorative numbering, and the ladder is a genuine sequence users talk
   about out loud ("she's on nudge two"). Numbering them unless you say otherwise.
5. The KPI row is four figures on bare paper separated by rules, not cards (7.6). It is the
   single riskiest call in the design and I will not know whether it reads as disciplined or
   as unfinished until it is on screen. First thing I want your eyes on in Phase 1.
