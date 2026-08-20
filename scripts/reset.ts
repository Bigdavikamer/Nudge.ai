/**
 * Drops everything and re-applies migrations. Development only.
 *
 *   npm run db:reset
 */
import 'dotenv/config'
import { rm } from 'node:fs/promises'
import { sql } from 'drizzle-orm'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset refuses to run in production.')
  }

  const url = process.env.DATABASE_URL
  if (url) {
    const [{ drizzle }, pg] = await Promise.all([
      import('drizzle-orm/node-postgres'),
      import('pg'),
    ])
    const pool = new pg.default.Pool({
      connectionString: url,
      ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    })
    const db = drizzle(pool)
    await db.execute(sql`drop schema if exists public cascade`)
    await db.execute(sql`create schema public`)
    await pool.end()
    console.log('dropped: node-postgres schema public')
  } else {
    await rm('.pglite', { recursive: true, force: true })
    console.log('dropped: .pglite')
  }

  await import('./migrate')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
