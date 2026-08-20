import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server'

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
)

type Handler = (req: NextRequest, event: NextFetchEvent) => Promise<Response> | Response
let handler: Handler | null = null

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  // With no Clerk keys the dev auth adapter is serving and there is nothing to
  // protect at the edge; lib/auth.ts already refuses this combination in
  // production, so this branch cannot reach real traffic.
  if (!clerkConfigured) return NextResponse.next()

  if (!handler) {
    const { clerkMiddleware } = await import('@clerk/nextjs/server')
    handler = clerkMiddleware() as unknown as Handler
  }
  return handler(req, event)
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)).*)', '/(api|trpc)(.*)'],
}
