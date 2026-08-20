import Link from 'next/link'
import { Nav } from '@/components/Nav'
import { requireSession } from '@/lib/auth'
import { isEmbeddedDb } from '@/lib/db'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div className="shell">
      {session.isDevAuth && (
        <p className="dev-banner">
          Development auth and{' '}
          {isEmbeddedDb ? 'an embedded database' : 'your configured database'}. Set Clerk keys
          {isEmbeddedDb ? ' and ' : ' '}
          {isEmbeddedDb ? <code>DATABASE_URL</code> : null} in <code>.env</code> to switch to the
          real ones.
        </p>
      )}

      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="wordmark">
            <span className="wordmark-mark" aria-hidden="true" />
            Nudge
          </Link>
          <Nav />
          <Link href="/invoices/new" className="btn">
            Add invoice
          </Link>
        </div>
      </header>

      <main className="page">{children}</main>
    </div>
  )
}
