/**
 * The clock adapter (D-006).
 *
 * `new Date()` is banned everywhere else in the codebase — see the
 * no-restricted-syntax rule in eslint.config.mjs. Every scheduling rule in
 * Phase 2 depends on being able to freeze time, and a single stray
 * `new Date()` inside a guard makes that test suite a liar.
 */
export interface Clock {
  now(): Date
}

// eslint-disable-next-line no-restricted-syntax
export const systemClock: Clock = { now: () => new Date() }

/** A clock frozen at an instant. The only clock the test suite uses. */
export function fixedClock(iso: string): Clock {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`fixedClock: unparseable instant "${iso}"`)
  return { now: () => new Date(ms) }
}

/** A clock that advances only when you tell it to. */
export function controllableClock(iso: string) {
  let ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`controllableClock: unparseable instant "${iso}"`)
  return {
    now: () => new Date(ms),
    advanceMs(delta: number) {
      ms += delta
    },
    advanceDays(days: number) {
      ms += days * 86_400_000
    },
  } satisfies Clock & { advanceMs(d: number): void; advanceDays(d: number): void }
}

export function getClock(): Clock {
  return systemClock
}
