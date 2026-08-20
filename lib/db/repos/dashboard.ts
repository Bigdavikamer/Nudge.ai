import { and, asc, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from '../index'
import { clients, events, invoices } from '../schema'
import { daysBetween, formatMonth, startOfMonth, todayInZone, type IsoDate } from '../../dates'
import { formatMoney, money } from '../../money'
import type { CurrencyTotal, DashboardMetrics, InvoiceStatus } from '../../types'

const OPEN_STATUSES: InvoiceStatus[] = ['open', 'part_paid']

function toTotals(byCurrency: Map<string, bigint>): CurrencyTotal[] {
  return [...byCurrency.entries()]
    .map(([currency, minor]) => ({
      currency,
      minor: minor.toString(),
      label: formatMoney(money(minor, currency)),
    }))
    .sort((a, b) => (BigInt(b.minor) > BigInt(a.minor) ? 1 : -1))
}

/**
 * The four numbers, in the order §2.6 puts them: recovered, at risk, average
 * days to pay, oldest open.
 *
 * "Recovered this month" sums the paid *events*, not the invoice rows, so the
 * figure is a record of what happened rather than a re-derivation from state
 * that someone might later edit.
 */
export async function getDashboardMetrics(
  orgId: string,
  now: Date,
  timezone: string,
): Promise<DashboardMetrics> {
  const db = await getDb()
  const today = todayInZone(now, timezone)
  const monthStart = startOfMonth(today)

  // Fetch from a day early in UTC, then filter by the org's local calendar —
  // exact across every offset, without doing offset arithmetic by hand.
  const fetchFrom = new Date(Date.parse(`${monthStart}T00:00:00Z`) - 86_400_000)

  const paidEvents = await db
    .select()
    .from(events)
    .where(
      and(eq(events.orgId, orgId), eq(events.type, 'invoice.paid'), gte(events.occurredAt, fetchFrom)),
    )

  const recoveredByCurrency = new Map<string, bigint>()
  let recoveredCount = 0
  for (const e of paidEvents) {
    if (todayInZone(e.occurredAt, timezone) < monthStart) continue
    const minor = e.payload.amountMinor
    const currency = e.payload.currency
    if (typeof minor !== 'string' || typeof currency !== 'string') continue
    recoveredByCurrency.set(currency, (recoveredByCurrency.get(currency) ?? 0n) + BigInt(minor))
    recoveredCount += 1
  }

  const openRows = await db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, OPEN_STATUSES)))
    .orderBy(asc(invoices.dueDate))

  const atRiskByCurrency = new Map<string, bigint>()
  for (const { invoice } of openRows) {
    const outstanding = invoice.amountMinor - invoice.amountPaidMinor
    if (outstanding <= 0n) continue
    atRiskByCurrency.set(
      invoice.currency,
      (atRiskByCurrency.get(invoice.currency) ?? 0n) + outstanding,
    )
  }

  // Average days to pay: issue date to payment date, last six months.
  const sixMonthsAgo = new Date(now.getTime() - 182 * 86_400_000)
  const settled = await db
    .select({ issueDate: invoices.issueDate, paidAt: invoices.paidAt })
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        eq(invoices.status, 'paid'),
        isNotNull(invoices.paidAt),
        gte(invoices.paidAt, sixMonthsAgo),
      ),
    )

  const spans: number[] = []
  for (const row of settled) {
    if (!row.paidAt) continue
    const paidOn = todayInZone(row.paidAt, timezone)
    spans.push(Math.max(0, daysBetween(row.issueDate, paidOn)))
  }
  const avgDaysToPay =
    spans.length > 0 ? spans.reduce((a, b) => a + b, 0) / spans.length : null

  const oldestRow = openRows.find((r) => daysBetween(r.invoice.dueDate, today) > 0)

  return {
    recovered: toTotals(recoveredByCurrency),
    recoveredCount,
    recoveredMonthLabel: formatMonth(monthStart),
    atRisk: toTotals(atRiskByCurrency),
    atRiskCount: openRows.length,
    avgDaysToPay: avgDaysToPay === null ? null : Math.round(avgDaysToPay * 10) / 10,
    avgDaysToPaySample: spans.length,
    oldest: oldestRow
      ? {
          id: oldestRow.invoice.id,
          invoiceNumber: oldestRow.invoice.invoiceNumber,
          clientName: oldestRow.client.name,
          daysLate: daysBetween(oldestRow.invoice.dueDate, today),
        }
      : null,
  }
}

/** Median days late over settled invoices, per client — the reliability score. */
export async function refreshReliability(orgId: string, timezone: string): Promise<void> {
  const db = await getDb()
  const rows = await db
    .select({
      clientId: invoices.clientId,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.status, 'paid'), isNotNull(invoices.paidAt)))
    .orderBy(asc(invoices.paidAt))

  const byClient = new Map<string, number[]>()
  for (const row of rows) {
    if (!row.paidAt) continue
    const late = daysBetween(row.dueDate, todayInZone(row.paidAt, timezone))
    const list = byClient.get(row.clientId) ?? []
    list.push(late)
    byClient.set(row.clientId, list)
  }

  for (const [clientId, allSpans] of byClient) {
    const spans = allSpans.slice(-6).sort((a, b) => a - b)
    if (spans.length === 0) continue
    const mid = Math.floor(spans.length / 2)
    const median =
      spans.length % 2 === 0 ? ((spans[mid - 1] ?? 0) + (spans[mid] ?? 0)) / 2 : (spans[mid] ?? 0)
    await db
      .update(clients)
      .set({ medianDaysLate: median.toFixed(2), reliabilitySampleSize: spans.length })
      .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)))
  }
}

export type { IsoDate }
