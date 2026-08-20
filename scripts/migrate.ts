/**
 * Applies the checked-in migrations in ./drizzle to whichever driver is
 * active. Safe to run repeatedly; drizzle tracks what has been applied.
 *
 *   npm run db:migrate
 */
import 'dotenv/config'

const MIGRATIONS_FOLDER = './drizzle'

async function main() {
  const url = process.env.DATABASE_URL

  if (url) {
    const [{ drizzle }, { migrate }, pg] = await Promise.all([
      import('drizzle-orm/node-postgres'),
      import('drizzle-orm/node-postgres/migrator'),
      import('pg'),
    ])
    const pool = new pg.default.Pool({
      connectionString: url,
      ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    })
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
    await pool.end()
    console.log('migrated: node-postgres')
    return
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production.')
  }

  const [{ drizzle }, { migrate }, { PGlite }] = await Promise.all([
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
    import('@electric-sql/pglite'),
  ])
  const client = new PGlite('.pglite')
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER })
  await client.close()
  console.log('migrated: pglite (.pglite)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
