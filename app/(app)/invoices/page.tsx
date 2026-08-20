import Link from 'next/link'
import { InvoiceTable } from '@/components/InvoiceTable'
import { getClock } from '@/lib/adapters/clock'
import { columnFor, type RailColumn } from '@/lib/aging'
import { requireSession } from '@/lib/auth'
import { listInvoices } from '@/lib/db/repos/invoices'
import { todayInZone } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'paid', label: 'Paid' },
  { key: 'all', label: 'All' },
] as const

const BAND_LABELS: Record<RailColumn, string> = {
  not_due: 'not due',
  late_1: '1–14 days late',
  late_2: '15–34 days late',
  late_3: '35+ days late',
}

function isRailColumn(value: string): value is RailColumn {
  return value === 'not_due' || value === 'late_1' || value === 'late_2' || value === 'late_3'
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; band?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const today = todayInZone(getClock().now(), session.timezone)

  const bandFilter = params.band && isRailColumn(params.band) ? params.band : null
  const status =
    params.status === 'paid' ? 'paid' : params.status === 'all' ? 'all' : ('open' as const)

  const all = await listInvoices(session.orgId, today, { status })
  const invoices = bandFilter ? all.filter((i) => columnFor(i.band) === bandFilter) : all

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <p className="muted small">
            {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
            {bandFilter ? ` · ${BAND_LABELS[bandFilter]}` : ''}
          </p>
        </div>
        <div className="btn-row">
          {FILTERS.map((filter) => (
            <Link
              key={filter.key}
              href={`/invoices?status=${filter.key}`}
              className="btn btn-quiet"
              aria-current={status === filter.key ? 'page' : undefined}
              style={
                status === filter.key
                  ? { background: 'var(--surface-sunken)', color: 'var(--text-primary)' }
                  : undefined
              }
            >
              {filter.label}
            </Link>
          ))}
        </div>
      </div>

      {bandFilter && (
        <p className="small" style={{ marginBottom: 'var(--space-4)' }}>
          Filtered to {BAND_LABELS[bandFilter]}.{' '}
          <Link href={`/invoices?status=${status}`}>Clear filter</Link>
        </p>
      )}

      <section className="sheet">
        <InvoiceTable
          invoices={invoices}
          emptyTitle={
            status === 'paid' ? 'Nothing paid yet.' : 'Nothing here.'
          }
          emptyBody={
            status === 'paid'
              ? 'Invoices you mark paid will collect here.'
              : 'Add the one you are most tired of thinking about.'
          }
        />
      </section>
    </>
  )
}
