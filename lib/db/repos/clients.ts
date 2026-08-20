import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../index'
import { clients, invoices } from '../schema'
import { formatMoney, money } from '../../money'
import type { ClientListItem, InvoiceStatus } from '../../types'

const OPEN_STATUSES: InvoiceStatus[] = ['open', 'part_paid']

export async function listClients(orgId: string): Promise<ClientListItem[]> {
  const db = await getDb()

  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.orgId, orgId))
    .orderBy(asc(clients.name))

  const open = await db
    .select({
      clientId: invoices.clientId,
      currency: invoices.currency,
      amountMinor: invoices.amountMinor,
      amountPaidMinor: invoices.amountPaidMinor,
    })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, OPEN_STATUSES)))

  const totals = new Map<string, Map<string, bigint>>()
  const counts = new Map<string, number>()
  for (const row of open) {
    const outstanding = row.amountMinor - row.amountPaidMinor
    if (outstanding <= 0n) continue
    counts.set(row.clientId, (counts.get(row.clientId) ?? 0) + 1)
    const byCurrency = totals.get(row.clientId) ?? new Map<string, bigint>()
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0n) + outstanding)
    totals.set(row.clientId, byCurrency)
  }

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.primaryEmail,
    openCount: counts.get(c.id) ?? 0,
    openTotals: [...(totals.get(c.id) ?? new Map<string, bigint>()).entries()].map(
      ([currency, minor]) => formatMoney(money(minor, currency)),
    ),
    medianDaysLate: c.medianDaysLate === null ? null : Number(c.medianDaysLate),
    reliabilitySampleSize: c.reliabilitySampleSize,
    neverChase: c.neverChase,
  }))
}

/**
 * Slowest payers. Internal only — §2.6 is explicit that the reliability score
 * never appears in copy the user might forward to the client it describes.
 */
export async function listSlowestPayers(orgId: string, limit = 5): Promise<ClientListItem[]> {
  const all = await listClients(orgId)
  return all
    .filter((c) => c.medianDaysLate !== null && c.reliabilitySampleSize > 0)
    .sort((a, b) => (b.medianDaysLate ?? 0) - (a.medianDaysLate ?? 0))
    .slice(0, limit)
}

export async function setNeverChase(orgId: string, clientId: string, value: boolean) {
  const db = await getDb()
  await db
    .update(clients)
    .set({ neverChase: value })
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)))
}
