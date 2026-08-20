import type { Metadata } from 'next'
import { Bricolage_Grotesque, Inter_Tight, JetBrains_Mono } from 'next/font/google'
import { clerkConfigured } from '@/lib/auth'
import './globals.css'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})

const body = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
})

const data = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nudge',
  description: 'The collections layer on top of the invoicing tool you already use.',
}

async function Providers({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured) return <>{children}</>
  const { ClerkProvider } = await import('@clerk/nextjs')
  return <ClerkProvider>{children}</ClerkProvider>
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
