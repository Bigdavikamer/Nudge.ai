'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/clients', label: 'Clients' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
        return (
          <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}>
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
