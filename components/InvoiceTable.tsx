import Link from 'next/link'
import { AgingPill } from './AgingPill'
import type { InvoiceListItem } from '@/lib/types'

export function InvoiceTable({
  invoices,
  emptyTitle,
  emptyBody,
}: {
  invoices: InvoiceListItem[]
  emptyTitle: string
  emptyBody: string
}) {
  if (invoices.length === 0) {
    return (
      <div className="empty">
        <strong>{emptyTitle}</strong>
        <p>{emptyBody}</p>
        <Link href="/invoices/new" className="btn">
          Add invoice
        </Link>
      </div>
    )
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            <th scope="col">Client</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col" className="right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <Link href={`/invoices/${invoice.id}`} className="num">
                  {invoice.invoiceNumber}
                </Link>
              </td>
              <td>{invoice.clientName}</td>
              <td className="num">{invoice.dueLabel}</td>
              <td>
                <AgingPill band={invoice.band}>{invoice.agingPhrase}</AgingPill>
              </td>
              <td className="right num">{invoice.amountLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
