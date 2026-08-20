import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { listClients } from '@/lib/db/repos/clients'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const session = await requireSession()
  const clients = await listClients(session.orgId)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="muted small">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}. Created automatically
            when you add an invoice.
          </p>
        </div>
      </div>

      <section className="sheet">
        {clients.length === 0 ? (
          <div className="empty">
            <strong>No clients yet.</strong>
            <p>Add an invoice and the client comes with it.</p>
            <Link href="/invoices/new" className="btn">
              Add invoice
            </Link>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Email</th>
                  <th scope="col" className="right">
                    Open
                  </th>
                  <th scope="col" className="right">
                    Outstanding
                  </th>
                  <th scope="col" className="right">
                    Median days late
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.name}</td>
                    <td className="num small muted">{client.email}</td>
                    <td className="right num">{client.openCount}</td>
                    <td className="right num">
                      {client.openTotals.length === 0 ? '—' : client.openTotals.join(' · ')}
                    </td>
                    <td className="right num">
                      {client.medianDaysLate === null
                        ? '—'
                        : `${client.medianDaysLate > 0 ? '+' : ''}${client.medianDaysLate}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
