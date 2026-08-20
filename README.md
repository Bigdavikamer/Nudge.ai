# Nudge

The collections layer that sits on top of the invoicing tool you already use.

Connect the tool you already invoice with. Nudge writes and sends the follow-ups you keep
putting off, in your voice, and shuts up the moment the money lands.

## Status — Phase 1 complete, awaiting gate review

Auth, schema, manual invoice entry, invoice list, and the Aging Rail on real data.
No email, no AI. Usable today as a manual receivables tracker.

## Running it

No accounts, no Docker, no connection string:

```bash
npm install && npm run db:migrate && npm run dev
```

With an empty `.env` the app boots on an embedded Postgres (PGlite, in `.pglite/`) behind a
development auth adapter that signs in one local user against an empty organisation. Both
are refused in production. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and the
Clerk keys to switch to the real ones — nothing else changes.

Want data to look at rather than an empty state:

```bash
npm run db:seed
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run check` | Typecheck, lint, token check, unit tests |
| `npm run test` | Vitest |
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply checked-in migrations |
| `npm run db:seed` | Sample receivables, positioned relative to today |
| `npm run db:reset` | Drop everything and re-migrate (dev only) |

## Layout

```
app/            routes — (app) is the authenticated shell
components/     aging-rail/ is the signature element
lib/
  adapters/     clock; mail, drafter and billing land in later phases
  db/           schema, driver selection, repos/ (every query takes an orgId)
  actions/      server actions
  aging.ts      the aging scale — one file, pure, tested
  money.ts      minor units, no floats, no FX
  dates.ts      calendar dates as strings, one timezone-aware function
  rail.ts       rail packing — pure, tested
drizzle/        checked-in migrations
scripts/        migrate, seed, reset, token check
tests/          Vitest units
```

## Rules the code enforces

- **Colours live in `styles/tokens.css` and nowhere else.** `npm run check:tokens` fails the
  build on a hex literal anywhere in `.css`, `.ts` or `.tsx`.
- **`new Date()` is banned outside `lib/adapters/clock.ts`** (ESLint). The Phase 2 scheduler
  is only testable if time is injected.
- **Every repository function takes an `orgId`** and filters on it. Tenancy is a signature,
  not an ambient context.
- **Money is `bigint` minor units + an ISO-4217 code.** Nothing sums across currencies.

## Docs

- [`docs/PHASE-0.md`](docs/PHASE-0.md) — data model, adapters, scheduler design, wireframes,
  design critique
- [`DECISIONS.md`](DECISIONS.md) — running log of non-obvious choices, with reasons
- [`styles/tokens.css`](styles/tokens.css) — the design tokens
