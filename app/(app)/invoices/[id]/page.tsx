import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AgingPill } from '@/components/AgingPill'
import { getClock } from '@/lib/adapters/clock'
import { markPaidAction, markUnpaidAction } from '@/lib/actions/invoices'
import { requireSession } from '@/lib/auth'
import { getInvoice } from '@/lib/db/repos/invoices'
import { todayInZone } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const { id } = await params
  const today = todayInZone(getClock().now(), session.timezone)
  const invoice = await getInvoice(session.orgId, id, today)

  if (!invoice) notFound()

  const paid = invoice.status === 'paid'

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <Link href="/invoices">← Invoices</Link>
          </p>
          <h1>
            <span className="num">{invoice.invoiceNumber}</span> · {invoice.clientName}
          </h1>
          <p className="muted small">
            issued {invoice.issueLabel} · due {invoice.dueLabelLong}
          </p>
        </div>

        <div className="btn-row">
          {paid ? (
            <form action={markUnpaidAction}>
              <input type="hidden" name="id" value={invoice.id} />
              <button type="submit" className="btn btn-quiet">
                Mark unpaid
              </button>
            </form>
          ) : (
            <form action={markPaidAction}>
              <input type="hidden" name="id" value={invoice.id} />
              <button type="submit" className="btn">
                Mark paid
              </button>
            </form>
          )}
        </div>
      </div>

      <section className="kpis" aria-label="Invoice summary">
        <div className="kpi kpi-lead">
          <span className="kpi-label">Amount</span>
          <span className="kpi-value" style={{ color: 'var(--text-primary)' }}>
            {invoice.amountLabel}
          </span>
          <span className="kpi-foot">
            <AgingPill band={invoice.band}>
              {paid ? `Paid ${invoice.paidAtLabel}` : invoice.agingPhrase}
            </AgingPill>
          </span>
        </div>

        <div className="kpi">
          <span className="kpi-label">Outstanding</span>
          <span className="kpi-value">{paid ? '—' : invoice.outstandingLabel}</span>
          <span className="kpi-foot">{invoice.currency}</span>
        </div>

        <div className="kpi">
          <span className="kpi-label">Due</span>
          <span className="kpi-value">{invoice.dueLabel}</span>
          <span className="kpi-foot">{paid ? 'settled' : invoice.agingPhrase}</span>
        </div>

        <div className="kpi">
          <span className="kpi-label">Days late</span>
          <span className="kpi-value">{paid ? '—' : Math.max(0, invoice.daysLate)}</span>
          <span className="kpi-foot">against the due date</span>
        </div>
      </section>

      <div className="detail-grid">
        <div className="stack">
          <section className="sheet">
            <div className="sheet-head">
              <h2>Chase</h2>
              <span className="micro">not scheduled</span>
            </div>
            <div className="empty">
              <p>
                Nothing is scheduled. The escalation ladder arrives in Phase 2 and sending in
                Phase 3 — until then Nudge is tracking this invoice, not chasing it.
              </p>
            </div>
          </section>

          <section className="sheet">
            <div className="sheet-head">
              <h2>Activity</h2>
              <span className="micro">
                {invoice.timeline.length} {invoice.timeline.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            {invoice.timeline.length === 0 ? (
              <div className="empty">
                <p>Nothing has happened to this invoice yet.</p>
              </div>
            ) : (
              <div className="timeline">
                {invoice.timeline.map((entry) => (
                  <div key={entry.id} className="timeline-row">
                    <time dateTime={entry.at}>{entry.atLabel}</time>
                    <div>
                      <div>{entry.title}</div>
                      {entry.detail && <div className="muted small">{entry.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="sheet">
          <div className="sheet-head">
            <h2>Client</h2>
          </div>
          <dl className="definition">
            <div>
              <dt>Name</dt>
              <dd>
                <Link href="/clients">{invoice.clientName}</Link>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd className="num small">{invoice.clientEmail}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd className="num">{invoice.currency}</dd>
            </div>
            {invoice.paymentUrl && (
              <div>
                <dt>Pay link</dt>
                <dd className="small">
                  <a href={invoice.paymentUrl} rel="noreferrer noopener" target="_blank">
                    {invoice.paymentUrl}
                  </a>
                </dd>
              </div>
            )}
            {invoice.lateFeeTerms && (
              <div>
                <dt>Late fee</dt>
                <dd className="small">{invoice.lateFeeTerms}</dd>
              </div>
            )}
            {invoice.notes && (
              <div>
                <dt>Notes</dt>
                <dd className="small">{invoice.notes}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </>
  )
}
