import type { AgingBand } from './aging'
import type { IsoDate } from './dates'

/**
 * DTOs crossing the server/client boundary.
 *
 * Two rules, both load-bearing:
 *  1. No `bigint` leaves the server — React cannot serialise it. Minor units
 *     travel as decimal strings, and anything the UI needs to compare with
 *     (chip size) also travels pre-divided as `majorUnits`.
 *  2. Currency formatting happens once, on the server, so a client with a
 *     different locale cannot silently reformat someone's money.
 */

export type InvoiceStatus = 'open' | 'part_paid' | 'paid' | 'void' | 'written_off'

export type InvoiceListItem = {
  id: string
  invoiceNumber: string
  clientId: string
  clientName: string

  currency: string
  /** Integer minor units as a string. Reconstruct with BigInt() server-side. */
  amountMinor: string
  /** Amount in major units. Display sizing only — never money arithmetic. */
  majorUnits: number
  amountLabel: string
  amountCompact: string
  outstandingLabel: string

  issueDate: IsoDate
  dueDate: IsoDate
  dueLabel: string

  status: InvoiceStatus
  daysLate: number
  band: AgingBand
  agingPhrase: string
  paidAtLabel: string | null
}

export type InvoiceDetail = InvoiceListItem & {
  clientEmail: string
  issueLabel: string
  dueLabelLong: string
  paymentUrl: string | null
  lateFeeTerms: string | null
  notes: string | null
  timeline: TimelineEntry[]
}

export type TimelineEntry = {
  id: string
  type: string
  title: string
  detail: string | null
  at: string
  atLabel: string
}

export type ClientListItem = {
  id: string
  name: string
  email: string
  openCount: number
  openTotals: string[]
  medianDaysLate: number | null
  reliabilitySampleSize: number
  neverChase: boolean
}

export type CurrencyTotal = {
  currency: string
  label: string
  minor: string
}

export type DashboardMetrics = {
  recovered: CurrencyTotal[]
  recoveredCount: number
  recoveredMonthLabel: string
  atRisk: CurrencyTotal[]
  atRiskCount: number
  avgDaysToPay: number | null
  avgDaysToPaySample: number
  oldest: { id: string; invoiceNumber: string; clientName: string; daysLate: number } | null
}
