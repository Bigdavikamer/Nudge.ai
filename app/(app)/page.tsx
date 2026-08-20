import Link from 'next/link'
import { AgingRail } from '@/components/aging-rail/AgingRail'
import { InvoiceTable } from '@/components/InvoiceTable'
import { getClock } from '@/lib/adapters/clock'
import { requireSession } from '@/lib/auth'
import { listSlowestPayers } from '@/lib/db/repos/clients'
import { getDashboardMetrics } from '@/lib/db/repos/dashboard'
import { listInvoices } from '@/lib/db/repos/invoices'
import { todayInZone } from '@/lib/dates'
import type { CurrencyTotal } from '@/lib/types'

export const dynamic = 'force-dynamic'

function Totals({ totals, zero }: { totals: CurrencyTotal[]; zero: string }) {
  if (totals.length === 0) return <>{zero}</>
  return (
    <span className="kpi-value-stack">
      {totals.map((t) => (
        <span key={t.currency}>{t.label}</span>
      ))}
    </span>
  )
}

export default async function DashboardPage() {
  const session = await requireSession()
  const now = getClock().now()
  const today = todayInZone(now, session.timezone)

  const [metrics, open, slowest] = await Promise.all([
    getDashboardMetrics(session.orgId, now, session.timezone),
    listInvoices(session.orgId, today, { status: 'open' }),
    listSlowestPayers(session.orgId, 5),
  ])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{session.orgName}</h1>
          <p className="muted small">Receivables as of {today}</p>
        </div>
      </div>

      {/* Four figures on bare paper, separated by rules. Not cards — the call
          flagged in PHASE-0 §7.6 as the riskiest thing in the design. */}
      <section className="kpis" aria-label="Key figures">
        <div className="kpi kpi-lead">
          <span className="kpi-label">Recovered this month</span>
          <span className="kpi-value">
            <Totals totals={metrics.recovered} zero="—" />
          </span>
          <span className="kpi-foot">
            {metrics.recoveredCount === 0
              ? `Nothing marked paid in ${metrics.recoveredMonthLabel} yet`
              : `${metrics.recoveredCount} ${
                  metrics.recoveredCount === 1 ? 'invoice' : 'invoices'
                }, ${metrics.recoveredMonthLabel}`}
          </span>
        </div>

        <div className="kpi">
          <span className="kpi-label">Cash at risk</span>
          <span className="kpi-value">
            <Totals totals={metrics.atRisk} zero="—" />
          </span>
          <span className="kpi-foot">
            {metrics.atRiskCount} open {metrics.atRiskCount === 1 ? 'invoice' : 'invoices'}
          </span>
        </div>

        <div className="kpi">
          <span className="kpi-label">Avg days to pay</span>
          <span className="kpi-value">
            {metrics.avgDaysToPay === null ? '—' : metrics.avgDaysToPay.toFixed(1)}
          </span>
          <span className="kpi-foot">
            {metrics.avgDaysToPaySample === 0
              ? 'No invoices paid yet'
              : `over ${metrics.avgDaysToPaySample} paid`}
          </span>
        </div>

        <div className="kpi">
          <span className="kpi-label">Oldest open</span>
          <span className="kpi-value">
            {metrics.oldest === null ? '—' : `${metrics.oldest.daysLate}d`}
          </span>
          <span className="kpi-foot">
            {metrics.oldest === null ? (
              'Nothing overdue'
            ) : (
              <Link href={`/invoices/${metrics.oldest.id}`}>
                {metrics.oldest.invoiceNumber} · {metrics.oldest.clientName}
              </Link>
            )}
          </span>
        </div>
      </section>

      <AgingRail invoices={open} />

      <div className="split">
        <section className="sheet">
          <div className="sheet-head">
            <h2>Open invoices</h2>
            <Link href="/invoices" className="small">
              All invoices
            </Link>
          </div>
          <InvoiceTable
            invoices={open}
            emptyTitle="No invoices yet."
            emptyBody="Add the one you are most tired of thinking about."
          />
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <h2>Slowest payers</h2>
            <span className="micro">median days late</span>
          </div>
          {slowest.length === 0 ? (
            <div className="empty">
              <p>
                Nothing to rank yet. This fills in once invoices have been paid and there is a
                pattern to see.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <tbody>
                  {slowest.map((client) => (
                    <tr key={client.id}>
                      <td>{client.name}</td>
                      <td className="right num">
                        {(client.medianDaysLate ?? 0) > 0 ? '+' : ''}
                        {client.medianDaysLate}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
