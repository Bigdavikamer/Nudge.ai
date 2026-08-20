import { daysBetween, type IsoDate } from './dates'

/**
 * The aging scale. This is the brand (§3), so it lives in one file, is pure,
 * and is unit tested — every colour, label and position on the Aging Rail
 * derives from here and nothing computes a band inline.
 */

export type AgingBand = 'not_due' | 'due_today' | 'late_1' | 'late_2' | 'late_3' | 'paid'

/** The rail has four columns; `due_today` sits at the right edge of the first. */
export type RailColumn = 'not_due' | 'late_1' | 'late_2' | 'late_3'

export type BandMeta = {
  /** Column header on the rail. */
  columnLabel: string
  /** Full label, used in the accessible name and on the invoice detail. */
  label: string
  fill: string
  text: string
  onFill: string
}

export const BAND_META: Record<AgingBand, BandMeta> = {
  not_due: {
    columnLabel: 'Not due',
    label: 'Not due yet',
    fill: 'var(--band-current-fill)',
    text: 'var(--band-current-text)',
    onFill: 'var(--band-current-on)',
  },
  due_today: {
    columnLabel: 'Not due',
    label: 'Due today',
    fill: 'var(--band-due-fill)',
    text: 'var(--band-due-text)',
    onFill: 'var(--band-due-on)',
  },
  late_1: {
    columnLabel: '1–14 late',
    label: '1–14 days late',
    fill: 'var(--band-late-1-fill)',
    text: 'var(--band-late-1-text)',
    onFill: 'var(--band-late-1-on)',
  },
  late_2: {
    columnLabel: '15–34 late',
    label: '15–34 days late',
    fill: 'var(--band-late-2-fill)',
    text: 'var(--band-late-2-text)',
    onFill: 'var(--band-late-2-on)',
  },
  late_3: {
    columnLabel: '35+ late',
    label: '35 or more days late',
    fill: 'var(--band-late-3-fill)',
    text: 'var(--band-late-3-text)',
    onFill: 'var(--band-late-3-on)',
  },
  paid: {
    columnLabel: 'Paid',
    label: 'Paid',
    fill: 'var(--band-paid-fill)',
    text: 'var(--band-paid-text)',
    onFill: 'var(--band-paid-on)',
  },
}

export const RAIL_COLUMNS: readonly RailColumn[] = ['not_due', 'late_1', 'late_2', 'late_3']

/** Positive when overdue, negative when still to come, 0 on the due date. */
export function daysLate(dueDate: IsoDate, today: IsoDate): number {
  return daysBetween(dueDate, today)
}

export function bandFor(days: number): Exclude<AgingBand, 'paid'> {
  if (days < 0) return 'not_due'
  if (days === 0) return 'due_today'
  if (days <= 14) return 'late_1'
  if (days <= 34) return 'late_2'
  return 'late_3'
}

export function columnFor(band: AgingBand): RailColumn {
  switch (band) {
    case 'not_due':
    case 'due_today':
    case 'paid':
      return 'not_due'
    case 'late_1':
      return 'late_1'
    case 'late_2':
      return 'late_2'
    case 'late_3':
      return 'late_3'
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Where a chip sits, as a fraction across its own column.
 *
 * The axis is piecewise, not linear, and deliberately so (PHASE-0 §6): a
 * single linear scale would push a 400-day-old invoice off the end and squash
 * everything actionable into the left few percent. Instead each band gets
 * equal width, and the 35+ band compresses beyond 90 days and hard-pins
 * anything older than a year to its right edge.
 */
export function railPosition(days: number): { column: RailColumn; t: number } {
  if (days <= 0) {
    // Two weeks of runway is what fits on screen; anything further out parks
    // at the left edge rather than compressing the useful part of the band.
    return { column: 'not_due', t: clamp01((days + 14) / 14) }
  }
  if (days <= 14) return { column: 'late_1', t: clamp01((days - 1) / 13) }
  if (days <= 34) return { column: 'late_2', t: clamp01((days - 15) / 19) }
  if (days <= 90) return { column: 'late_3', t: clamp01(((days - 35) / 55) * 0.7) }
  if (days <= 365) return { column: 'late_3', t: clamp01(0.7 + ((days - 90) / 275) * 0.3) }
  return { column: 'late_3', t: 1 }
}

/**
 * Chip size, 0..1, from amount.
 *
 * Normalised **within a currency**, against the largest open invoice in that
 * currency. Sizing a ¥500,000 chip against a $5,000 one would be an implicit
 * exchange rate, and §7 puts FX out of scope — so size means "large for you",
 * not "large in dollars". For the single-currency org this is indentical to
 * plain amount scaling; for a mixed one it stays honest.
 *
 * Square root, not linear: one enormous invoice would otherwise shrink every
 * other chip to a hairline.
 */
export function chipScale(majorUnits: number, maxMajorUnits: number): number {
  if (maxMajorUnits <= 0) return 0
  return clamp01(Math.sqrt(Math.max(majorUnits, 0) / maxMajorUnits))
}

/** "9 days late", "due today", "due in 3 days" — used in text and aria labels. */
export function agingPhrase(days: number): string {
  if (days === 0) return 'due today'
  if (days < 0) return days === -1 ? 'due tomorrow' : `due in ${-days} days`
  return days === 1 ? '1 day late' : `${days} days late`
}
