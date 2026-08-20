import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb } from './db'
import { organizations, users } from './db/schema'

/**
 * Auth, isolated (§4).
 *
 * Two adapters behind one interface. Clerk when it is configured; a dev
 * adapter when it is not, so `npm run dev` works with an empty .env and no
 * accounts to create (D-018). The dev adapter provisions an empty
 * organisation — no clients, no invoices, no fabricated history. Data comes
 * from `npm run db:seed` or from using the app.
 *
 * Production without Clerk is a hard startup error, not a silent fallback.
 */

export type Session = {
  userId: string
  orgId: string
  email: string
  name: string
  orgName: string
  /** The org's default timezone — what "today" means for aging. */
  timezone: string
  /** True when the dev adapter is serving. The UI shows a banner. */
  isDevAuth: boolean
}

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const secretKey = process.env.CLERK_SECRET_KEY

if (Boolean(publishableKey) !== Boolean(secretKey)) {
  throw new Error(
    'Clerk is half-configured. Set both NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and ' +
      'CLERK_SECRET_KEY, or neither to use the development auth adapter.',
  )
}

export const clerkConfigured = Boolean(publishableKey && secretKey)
export const authMode: 'clerk' | 'dev' = clerkConfigured ? 'clerk' : 'dev'

/**
 * Checked when a request arrives, not when the module loads.
 *
 * `next build` runs with NODE_ENV=production, and building without secrets
 * present is entirely normal — they are injected at deploy. Throwing at
 * module scope would make a keyless CI build impossible while doing nothing
 * extra for safety: this runs before any session is ever issued.
 */
function assertAuthConfigured(): void {
  if (!clerkConfigured && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Clerk keys are required in production. The development auth adapter signs ' +
        'in a single local user with no credential check and must never serve real traffic.',
    )
  }
}

/** Stable ids so dev provisioning is idempotent under concurrent requests. */
const DEV_ORG_ID = '00000000-0000-4000-8000-000000000001'
const DEV_USER_ID = '00000000-0000-4000-8000-000000000002'

async function devSession(): Promise<Session> {
  const db = await getDb()
  const name = process.env.DEV_USER_NAME ?? 'You'
  const email = (process.env.DEV_USER_EMAIL ?? 'you@example.com').toLowerCase()
  const orgName = process.env.DEV_ORG_NAME ?? 'Your business'
  const timezone = process.env.DEV_TIMEZONE ?? 'UTC'

  await db
    .insert(organizations)
    .values({ id: DEV_ORG_ID, name: orgName, defaultTimezone: timezone })
    .onConflictDoNothing()
  await db
    .insert(users)
    .values({ id: DEV_USER_ID, orgId: DEV_ORG_ID, email, name, role: 'owner' })
    .onConflictDoNothing()

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, DEV_ORG_ID),
  })

  return {
    userId: DEV_USER_ID,
    orgId: DEV_ORG_ID,
    email,
    name,
    orgName: org?.name ?? orgName,
    timezone: org?.defaultTimezone ?? timezone,
    isDevAuth: true,
  }
}

async function clerkSession(): Promise<Session | null> {
  const { auth, currentUser } = await import('@clerk/nextjs/server')
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) return null

  const db = await getDb()
  let user = await db.query.users.findFirst({ where: eq(users.clerkUserId, clerkUserId) })

  if (!user) {
    // First sign-in: provision an organisation for them. Empty, always.
    const profile = await currentUser()
    const email = profile?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? ''
    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || email
    const orgName = name ? `${name}'s business` : 'Your business'

    const [org] = await db.insert(organizations).values({ name: orgName }).returning()
    if (!org) throw new Error('Could not create an organisation for the new user.')
    const [created] = await db
      .insert(users)
      .values({ clerkUserId, orgId: org.id, email, name: name || email, role: 'owner' })
      .returning()
    user = created
  }
  if (!user) throw new Error('Could not resolve a user record.')

  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.orgId) })
  if (!org) throw new Error('User has no organisation.')

  return {
    userId: user.id,
    orgId: org.id,
    email: user.email,
    name: user.name,
    orgName: org.name,
    timezone: org.defaultTimezone,
    isDevAuth: false,
  }
}

/** Deduped per request, so a page with six server components hits it once. */
export const getSession = cache(async (): Promise<Session | null> => {
  assertAuthConfigured()
  return clerkConfigured ? clerkSession() : devSession()
})

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  return session
}
