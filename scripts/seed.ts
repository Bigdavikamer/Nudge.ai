/**
 * Seed data — the only place fabricated records are allowed to exist (§0).
 *
 * Everything is positioned relative to today, so the Aging Rail always has
 * something in every band no matter when you run it.
 *
 *   npm run db:seed
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db/index'
import { clients, events, invoices, organizations, users } from '../lib/db/schema'
import { addDays, todayInZone } from '../lib/dates'
import { parseAmountToMinor } from '../lib/money'
import { systemClock } from '../lib/adapters/clock'

const DEV_ORG_ID = '00000000-0000-4000-8000-000000000001'
const DEV_USER_ID = '00000000-0000-4000-8000-000000000002'

type SeedInvoice = {
  client: string
  email: string
  number: string
  amount: string
  currency: string
  /** Days from today. Negative = already overdue. */
  dueIn: number
  termsDays: number
  paidDaysAgo?: number
  paymentUrl?: string
  lateFeeTerms?: string
}

const SEED: SeedInvoice[] = [
  // Overdue, spread across all three late bands.
  { client: 'Northwind Ltd', email: 'ap@northwind.example', number: '1042', amount: '2,400.00', currency: 'USD', dueIn: -9, termsDays: 14, paymentUrl: 'https://pay.example.com/1042' },
  { client: 'Northwind Ltd', email: 'ap@northwind.example', number: '1051', amount: '780.00', currency: 'USD', dueIn: -3, termsDays: 14 },
  { client: 'Kestrel Design', email: 'ana@kestrel.example', number: 'KD-204', amount: '5,150.00', currency: 'USD', dueIn: -22, termsDays: 30, lateFeeTerms: '2% per month after 30 days' },
  { client: 'Kestrel Design', email: 'ana@kestrel.example', number: 'KD-211', amount: '1,900.00', currency: 'USD', dueIn: -17, termsDays: 30 },
  { client: 'Halden Co', email: 'finance@halden.example', number: 'H-0088', amount: '12,900.00', currency: 'USD', dueIn: -47, termsDays: 30 },
  { client: 'Orrin & Sons', email: 'bill@orrin.example', number: '2201', amount: '640.00', currency: 'USD', dueIn: -68, termsDays: 7 },
  { client: 'Marlow Studio', email: 'hi@marlow.example', number: 'MS-17', amount: '3,250.00', currency: 'EUR', dueIn: -12, termsDays: 21 },
  { client: 'Pike Logistics', email: 'accounts@pike.example', number: 'PL-9931', amount: '8,400.00', currency: 'USD', dueIn: -31, termsDays: 30 },
  { client: 'Verity Books', email: 'pay@verity.example', number: 'VB-303', amount: '415.00', currency: 'GBP', dueIn: -5, termsDays: 14 },

  // Due today and coming up.
  { client: 'Ashcroft Media', email: 'ap@ashcroft.example', number: 'AM-77', amount: '1,250.00', currency: 'USD', dueIn: 0, termsDays: 14 },
  { client: 'Beckett Farms', email: 'office@beckett.example', number: 'BF-1204', amount: '2,050.00', currency: 'USD', dueIn: 3, termsDays: 21 },
  { client: 'Marlow Studio', email: 'hi@marlow.example', number: 'MS-19', amount: '1,100.00', currency: 'EUR', dueIn: 9, termsDays: 21 },

  // Paid — drives "recovered this month" and the reliability scores.
  { client: 'Northwind Ltd', email: 'ap@northwind.example', number: '1030', amount: '3,600.00', currency: 'USD', dueIn: -40, termsDays: 14, paidDaysAgo: 6 },
  { client: 'Kestrel Design', email: 'ana@kestrel.example', number: 'KD-198', amount: '4,200.00', currency: 'USD', dueIn: -55, termsDays: 30, paidDaysAgo: 11 },
  { client: 'Ashcroft Media', email: 'ap@ashcroft.example', number: 'AM-71', amount: '1,800.00', currency: 'USD', dueIn: -60, termsDays: 14, paidDaysAgo: 2 },
  { client: 'Beckett Farms', email: 'office@beckett.example', number: 'BF-1188', amount: '990.00', currency: 'USD', dueIn: -70, termsDays: 21, paidDaysAgo: 20 },
]

async function main() {
  const db = await getDb()
  const now = systemClock.now()
  const today = todayInZone(now, 'UTC')

  await db
    .insert(organizations)
    .values({ id: DEV_ORG_ID, name: 'Fieldnote Studio', defaultTimezone: 'UTC' })
    .onConflictDoNothing()
  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      orgId: DEV_ORG_ID,
      email: 'you@example.com',
      name: 'You',
      role: 'owner',
    })
    .onConflictDoNothing()

  // Wipe only this org's domain rows so re-seeding is idempotent.
  await db.delete(events).where(eq(events.orgId, DEV_ORG_ID))
  await db.delete(invoices).where(eq(invoices.orgId, DEV_ORG_ID))
  await db.delete(clients).where(eq(clients.orgId, DEV_ORG_ID))

  const clientIds = new Map<string, string>()
  for (const row of SEED) {
    if (clientIds.has(row.email)) continue
    const [created] = await db
      .insert(clients)
      .values({ orgId: DEV_ORG_ID, name: row.client, primaryEmail: row.email })
      .returning({ id: clients.id })
    if (!created) throw new Error(`Could not create client ${row.client}`)
    clientIds.set(row.email, created.id)
  }

  let openCount = 0
  let paidCount = 0

  for (const row of SEED) {
    const clientId = clientIds.get(row.email)
    if (!clientId) throw new Error(`Missing client for ${row.email}`)

    const dueDate = addDays(today, row.dueIn)
    const issueDate = addDays(dueDate, -row.termsDays)
    const amountMinor = parseAmountToMinor(row.amount, row.currency)
    const isPaid = row.paidDaysAgo !== undefined
    const paidAt = isPaid ? new Date(now.getTime() - row.paidDaysAgo! * 86_400_000) : null

    const [invoice] = await db
      .insert(invoices)
      .values({
        orgId: DEV_ORG_ID,
        clientId,
        source: 'manual',
        invoiceNumber: row.number,
        currency: row.currency,
        amountMinor,
        amountPaidMinor: isPaid ? amountMinor : 0n,
        issueDate,
        dueDate,
        status: isPaid ? 'paid' : 'open',
        paidAt,
        paymentUrl: row.paymentUrl ?? null,
        lateFeeTerms: row.lateFeeTerms ?? null,
      })
      .returning({ id: invoices.id })
    if (!invoice) throw new Error(`Could not create invoice ${row.number}`)

    await db.insert(events).values({
      orgId: DEV_ORG_ID,
      invoiceId: invoice.id,
      clientId,
      type: 'invoice.created',
      actor: DEV_USER_ID,
      occurredAt: new Date(Date.parse(`${issueDate}T09:00:00Z`)),
      payload: {
        invoiceNumber: row.number,
        amountMinor: amountMinor.toString(),
        currency: row.currency,
        source: 'manual',
      },
    })

    if (isPaid && paidAt) {
      await db.insert(events).values({
        orgId: DEV_ORG_ID,
        invoiceId: invoice.id,
        clientId,
        type: 'invoice.paid',
        actor: DEV_USER_ID,
        occurredAt: paidAt,
        payload: {
          invoiceNumber: row.number,
          amountMinor: amountMinor.toString(),
          currency: row.currency,
        },
      })
      paidCount += 1
    } else {
      openCount += 1
    }
  }

  const { refreshReliability } = await import('../lib/db/repos/dashboard')
  await refreshReliability(DEV_ORG_ID, 'UTC')

  console.log(`seeded: ${clientIds.size} clients, ${openCount} open, ${paidCount} paid`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
