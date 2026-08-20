# DECISIONS

One line per non-obvious choice, with the reason. Append; never rewrite history.

## Phase 0

- **D-001 — Repo home and product name are unresolved.** Scaffolded at `FollowFlow.app/chaser/` as a sibling to the existing (unrelated) `followflow/` lead-chaser. A `git mv` away from anywhere else. Awaiting answer.
- **D-002 — Neon over Supabase.** Clerk owns auth, so Supabase's auth/storage/realtime are dead weight. Neon's branching gives a throwaway DB per PR, which matters because the scheduler needs backfill rehearsals against real-shaped data.
- **D-003 — Money is `amount_minor BIGINT` + ISO-4217 `currency`.** Never a float, never a decimal string in app code. No FX anywhere (§7 forbids it), so currency is display metadata, never arithmetic input. Totals across mixed currencies are rendered as separate per-currency figures, not summed.
- **D-004 — Consolidation is modelled as `messages` ↔ `message_invoices` (many-to-many).** An outbound message covers N invoices. A FK from invoice → message cannot express the 48-hour cap and consolidation at the same time; this shape can.
- **D-005 — All scheduling rules live in one pure function, `SendGuard.decide()`.** Input is a plain snapshot struct, output is a discriminated union. No DB, no network, no ambient clock. This is what makes acceptance criterion #5 provable by unit test instead of by inspection.
- **D-006 — Injectable `Clock` adapter.** `new Date()` is banned outside `lib/adapters/clock.ts`; enforced by an ESLint `no-restricted-syntax` rule. Timezone bugs are untestable otherwise.
- **D-007 — Timezone resolution order: `client.timezone` → country code mapped to a representative IANA zone → `org.default_timezone`.** The resolved zone and its provenance are persisted on every message row, so a mis-timed send is diagnosable after the fact.
- **D-008 — Holidays are national-level, best-effort, cached in `holidays_cache`.** Weekend and 08:00–17:00 are hard rules the guard enforces; holidays are a soft skip that degrades to "send anyway" when the country is unknown. Library choice pending a licence check (see `docs/PHASE-0.md` §2.4).
- **D-009 — An invoice at the final-notice step is excluded from consolidated automated messages entirely.** It routes to the manual queue on its own. Otherwise the "final notice never auto-sends" guarantee leaks out through the consolidator, which is the one way that rule could plausibly break in production.
- **D-010 — The voice profile is re-derived from the last N *sent* messages on a schedule, not mutated incrementally on each edit.** Incremental self-training on your own output drifts. Edits are stored as evidence; derivation is a separate, reviewable step, and the resulting descriptor is user-visible and user-editable.
- **D-011 — Aging colours are fills and marks, never body text on paper.** `--mint-300` measures 1.57:1 and `--amber-500` 2.02:1 against `--paper`; both fail WCAG AA for text. Added text-weight `--mint-800` and `--amber-800` carrying the same semantics. Measured numbers in `docs/PHASE-0.md` §7.2.
- **D-012 — No dark mode in v1.** The palette in §3 is a light-paper system; a dark inversion would need a second aging scale designed from scratch, and the aging scale is the brand.
- **D-013 — Invoices imported already-overdue start `paused_manual`, not `active`.** Prevents the product's first act from being a Final Notice blast at a client's twelve-month backlog. The user opts each one in.
- **D-014 — `MAIL_MODE=sandbox` is the default everywhere except production.** The transport adapter throws on any recipient outside an allowlist. A collections product that emails a real client from a dev laptop is an unrecoverable trust failure.
