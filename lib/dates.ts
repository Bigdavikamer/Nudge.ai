/**
 * Calendar dates, as strings.
 *
 * Due dates are calendar facts, not instants: an invoice due on 12 August is
 * due on 12 August whether you are in Auckland or Los Angeles. Representing
 * them as `Date` objects invites a timezone shift to move them a day, which
 * is the single most common way aging calculations go wrong. So they stay as
 * `yyyy-mm-dd` strings end to end, and the only place a timezone enters is
 * `todayInZone`, where it belongs.
 */

/** `yyyy-mm-dd`. */
export type IsoDate = string

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value)
  if (!m) return false
  const [, y, mo, d] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const asUtc = new Date(Date.UTC(year, month - 1, day))
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  )
}

function assertIsoDate(value: string): void {
  if (!isValidIsoDate(value)) throw new Error(`Not a calendar date: "${value}"`)
}

function toUtcMs(value: IsoDate): number {
  assertIsoDate(value)
  const m = ISO_RE.exec(value)!
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fromUtcMs(ms: number): IsoDate {
  const d = new Date(ms)
  const y = String(d.getUTCFullYear()).padStart(4, '0')
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/** What day is it, where the recipient is? The one timezone-aware function. */
export function todayInZone(now: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value
  const y = get('year')
  const m = get('month')
  const d = get('day')
  if (!y || !m || !d) throw new Error(`Could not resolve today in zone "${timeZone}"`)
  return `${y}-${m}-${d}`
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000)
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(value) + days * 86_400_000)
}

/** 0 = Sunday. Uses UTC arithmetic, so it never shifts across a zone. */
export function dayOfWeek(value: IsoDate): number {
  return new Date(toUtcMs(value)).getUTCDay()
}

export function isWeekend(value: IsoDate): boolean {
  const d = dayOfWeek(value)
  return d === 0 || d === 6
}

export function startOfMonth(value: IsoDate): IsoDate {
  assertIsoDate(value)
  return `${value.slice(0, 7)}-01`
}

/** "12 Aug" — the table and rail format. */
export function formatDateShort(value: IsoDate, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(toUtcMs(value)))
}

/** "12 August 2026" — invoice detail. */
export function formatDateLong(value: IsoDate, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(toUtcMs(value)))
}

/** "August 2026" — the recovered-this-month label. */
export function formatMonth(value: IsoDate, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(toUtcMs(value)))
}
