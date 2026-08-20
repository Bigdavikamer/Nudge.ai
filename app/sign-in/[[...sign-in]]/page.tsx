import { clerkConfigured } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Only reachable when Clerk is configured — the dev adapter never returns a
 * null session, so requireSession() has nothing to redirect here.
 */
export default async function SignInPage() {
  if (!clerkConfigured) {
    return (
      <main className="page">
        <h1>Sign-in is not configured</h1>
        <p className="muted">
          Nudge is running on the development auth adapter, which signs you in automatically.
          Add Clerk keys to <code>.env</code> to turn on real sign-in.
        </p>
      </main>
    )
  }

  const { SignIn } = await import('@clerk/nextjs')
  return (
    <main className="page" style={{ display: 'grid', placeItems: 'center' }}>
      <SignIn />
    </main>
  )
}
