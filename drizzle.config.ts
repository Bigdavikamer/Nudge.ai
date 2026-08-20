import type { Config } from 'drizzle-kit'

// Migrations are generated against a plain Postgres dialect and applied by
// scripts/migrate.ts, which runs them against whichever driver is active
// (PGlite in zero-setup dev, node-postgres/Neon otherwise). Same SQL both ways.
export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/nudge',
  },
  strict: true,
  verbose: true,
} satisfies Config
