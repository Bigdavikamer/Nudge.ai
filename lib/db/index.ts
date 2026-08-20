import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

/**
 * One database, two drivers.
 *
 *   DATABASE_URL set    -> node-postgres. Works against local Postgres, Neon,
 *                          Supabase, anything speaking the wire protocol.
 *   DATABASE_URL unset  -> PGlite, real Postgres compiled to WASM, stored in
 *                          .pglite/. Zero setup: no Docker, no account, no
 *                          connection string. Development only (D-017).
 *
 * Both run byte-identical migrations, so the second is a convenience rather
 * than a divergence. Production refuses to start without a real URL.
 */
export type Db = NodePgDatabase<typeof schema>

declare global {
  // eslint-disable-next-line no-var
  var __nudgeDb: Promise<Db> | undefined
}

export const isEmbeddedDb = !process.env.DATABASE_URL

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL is required in production. The embedded PGlite database is a ' +
        'development convenience and its data lives in a local directory that does ' +
        'not survive a deploy.',
    )
  }
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL

  if (url) {
    const [{ drizzle }, pg] = await Promise.all([
      import('drizzle-orm/node-postgres'),
      import('pg'),
    ])
    const pool = new pg.default.Pool({
      connectionString: url,
      // Managed Postgres (Neon, Supabase, RDS) terminates TLS with certs that
      // are not in Node's default store; the connection is still encrypted.
      ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
      max: 10,
    })
    return drizzle(pool, { schema })
  }

  assertNotProduction()
  const [{ drizzle }, { PGlite }] = await Promise.all([
    import('drizzle-orm/pglite'),
    import('@electric-sql/pglite'),
  ])
  const client = new PGlite('.pglite')
  // Same SQL, same engine, different transport. One cast beats threading a
  // union of two driver types through every repository signature.
  return drizzle(client, { schema }) as unknown as Db
}

/** Cached across HMR reloads so dev does not open a pool per edit. */
export function getDb(): Promise<Db> {
  globalThis.__nudgeDb ??= createDb()
  return globalThis.__nudgeDb
}

export { schema }
