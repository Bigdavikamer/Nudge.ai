import Link from 'next/link'
import { InvoiceForm } from '@/components/InvoiceForm'
import { getClock } from '@/lib/adapters/clock'
import { requireSession } from '@/lib/auth'
import { addDays, todayInZone } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function NewInvoicePage() {
  const session = await requireSession()
  const today = todayInZone(getClock().now(), session.timezone)

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <Link href="/invoices">← Invoices</Link>
          </p>
          <h1>Add invoice</h1>
          <p className="muted small">
            Enter what you already sent. Nudge tracks it; it does not issue invoices.
          </p>
        </div>
      </div>

      <section className="sheet" style={{ padding: 'var(--space-5)' }}>
        <InvoiceForm
          defaultIssueDate={today}
          defaultDueDate={addDays(today, 14)}
          defaultCurrency="USD"
        />
      </section>
    </>
  )
}
