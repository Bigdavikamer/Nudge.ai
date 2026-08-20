import { BAND_META, chipScale, railPosition, RAIL_COLUMNS, type RailColumn } from './aging'
import type { InvoiceListItem } from './types'

/**
 * Aging Rail layout.
 *
 * Pure, deterministic, and computed on the server so the rail arrives with the
 * page — no measurement pass, no hydration flash, and nothing that reflows
 * (AC#8 wants zero CLS on this element).
 *
 * Chips are placed into discrete slots rather than at exact percentages. That
 * is what makes collision handling honest: a chip either gets a slot near
 * where it belongs, or it joins the overflow cluster. Nothing is ever drawn
 * on top of something else, and no money is silently hidden — the cluster
 * carries a count and opens a filtered list.
 *
 * Position is therefore quantised to roughly a twenty-fourth of a band. Nobody
 * reads an exact day count off a rail; the band, the hover card and the table
 * below all carry the precise figure.
 */

export const SLOTS_PER_COLUMN = 24

export type PlacedChip = {
  item: InvoiceListItem
  /** 0 .. SLOTS_PER_COLUMN-1, left to right within the column. */
  slot: number
  /** 0..1 — chip height, from amount, normalised within its own currency. */
  scale: number
}

export type PackedColumn = {
  column: RailColumn
  label: string
  placed: PlacedChip[]
  /** Did not fit. Rendered as a single "+n" cluster at the column's edge. */
  overflow: InvoiceListItem[]
}

/** Largest open invoice per currency — chips are scaled within their own
 *  currency, never across (see chipScale). */
function maxByCurrency(items: readonly InvoiceListItem[]): Map<string, number> {
  const max = new Map<string, number>()
  for (const item of items) {
    max.set(item.currency, Math.max(max.get(item.currency) ?? 0, item.majorUnits))
  }
  return max
}

/** Nearest free slot to `ideal`, searching outward. Null when the column is full. */
function findSlot(occupied: Set<number>, ideal: number, slots: number): number | null {
  if (!occupied.has(ideal)) return ideal
  for (let radius = 1; radius < slots; radius += 1) {
    const left = ideal - radius
    if (left >= 0 && !occupied.has(left)) return left
    const right = ideal + radius
    if (right < slots && !occupied.has(right)) return right
  }
  return null
}

export function packRail(
  items: readonly InvoiceListItem[],
  slots: number = SLOTS_PER_COLUMN,
): PackedColumn[] {
  const maxima = maxByCurrency(items)

  const byColumn = new Map<RailColumn, InvoiceListItem[]>()
  for (const column of RAIL_COLUMNS) byColumn.set(column, [])
  for (const item of items) {
    if (item.status === 'paid' || item.status === 'void' || item.status === 'written_off') continue
    const { column } = railPosition(item.daysLate)
    byColumn.get(column)?.push(item)
  }

  return RAIL_COLUMNS.map((column) => {
    // Biggest first, so the largest amounts land nearest their true position
    // and small ones absorb the displacement.
    const columnItems = [...(byColumn.get(column) ?? [])].sort(
      (a, b) => b.majorUnits - a.majorUnits || a.id.localeCompare(b.id),
    )

    const occupied = new Set<number>()
    const placed: PlacedChip[] = []
    const overflow: InvoiceListItem[] = []

    for (const item of columnItems) {
      const { t } = railPosition(item.daysLate)
      const ideal = Math.min(slots - 1, Math.max(0, Math.round(t * (slots - 1))))
      const slot = findSlot(occupied, ideal, slots)
      if (slot === null) {
        overflow.push(item)
        continue
      }
      occupied.add(slot)
      placed.push({
        item,
        slot,
        scale: chipScale(item.majorUnits, maxima.get(item.currency) ?? 0),
      })
    }

    placed.sort((a, b) => a.slot - b.slot)
    return {
      column,
      label: BAND_META[column === 'not_due' ? 'not_due' : column].columnLabel,
      placed,
      overflow,
    }
  })
}

/** Axis ticks under each column, for orientation. */
export const RAIL_TICKS: Record<RailColumn, string[]> = {
  not_due: ['−14d', 'due'],
  late_1: ['+1', '+14'],
  late_2: ['+15', '+34'],
  late_3: ['+35', '+90', '1y+'],
}
