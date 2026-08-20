import { describe, expect, it } from 'vitest'
import { packRail, SLOTS_PER_COLUMN } from '@/lib/rail'
import type { InvoiceListItem } from '@/lib/types'

function invoice(overrides: Partial<InvoiceListItem> & { id: string }): InvoiceListItem {
  return {
    invoiceNumber: overrides.id,
    clientId: 'c1',
    clientName: 'Test Client',
    currency: 'USD',
    amountMinor: '100000',
    majorUnits: 1000,
    amountLabel: '$1,000.00',
    amountCompact: '$1k',
    outstandingLabel: '$1,000.00',
    issueDate: '2026-08-01',
    dueDate: '2026-08-15',
    dueLabel: '15 Aug',
    status: 'open',
    daysLate: 0,
    band: 'due_today',
    agingPhrase: 'due today',
    paidAtLabel: null,
    ...overrides,
  }
}

describe('packRail', () => {
  it('returns all four columns even when empty', () => {
    const columns = packRail([])
    expect(columns.map((c) => c.column)).toEqual(['not_due', 'late_1', 'late_2', 'late_3'])
    expect(columns.every((c) => c.placed.length === 0 && c.overflow.length === 0)).toBe(true)
  })

  it('sorts invoices into the band their lateness belongs to', () => {
    const columns = packRail([
      invoice({ id: 'a', daysLate: -5, band: 'not_due' }),
      invoice({ id: 'b', daysLate: 9, band: 'late_1' }),
      invoice({ id: 'c', daysLate: 20, band: 'late_2' }),
      invoice({ id: 'd', daysLate: 60, band: 'late_3' }),
    ])
    expect(columns[0]?.placed.map((p) => p.item.id)).toEqual(['a'])
    expect(columns[1]?.placed.map((p) => p.item.id)).toEqual(['b'])
    expect(columns[2]?.placed.map((p) => p.item.id)).toEqual(['c'])
    expect(columns[3]?.placed.map((p) => p.item.id)).toEqual(['d'])
  })

  it('leaves settled invoices off the rail entirely', () => {
    const columns = packRail([
      invoice({ id: 'paid', daysLate: 9, band: 'paid', status: 'paid' }),
      invoice({ id: 'void', daysLate: 9, band: 'late_1', status: 'void' }),
      invoice({ id: 'off', daysLate: 9, band: 'late_1', status: 'written_off' }),
      invoice({ id: 'open', daysLate: 9, band: 'late_1' }),
    ])
    const ids = columns.flatMap((c) => c.placed.map((p) => p.item.id))
    expect(ids).toEqual(['open'])
  })

  it('never places two chips in the same slot', () => {
    // Twelve invoices all exactly nine days late — every one wants the same slot.
    const items = Array.from({ length: 12 }, (_, i) =>
      invoice({ id: `i${i}`, daysLate: 9, band: 'late_1' }),
    )
    const column = packRail(items)[1]
    expect(column).toBeDefined()
    const slots = column!.placed.map((p) => p.slot)
    expect(new Set(slots).size).toBe(slots.length)
    expect(column!.overflow).toHaveLength(0)
  })

  it('overflows rather than overlapping once a column is full', () => {
    const items = Array.from({ length: SLOTS_PER_COLUMN + 7 }, (_, i) =>
      invoice({ id: `i${i}`, daysLate: 9, band: 'late_1' }),
    )
    const column = packRail(items)[1]!
    expect(column.placed).toHaveLength(SLOTS_PER_COLUMN)
    expect(column.overflow).toHaveLength(7)
  })

  it('loses no money — every invoice is either placed or in the overflow', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      invoice({ id: `i${i}`, daysLate: (i % 120) - 10, band: 'late_1' }),
    )
    const columns = packRail(items)
    const accounted = columns.reduce((n, c) => n + c.placed.length + c.overflow.length, 0)
    expect(accounted).toBe(200)
  })

  it('gives the largest invoice the slot nearest its true position', () => {
    const columns = packRail([
      invoice({ id: 'small', daysLate: 9, band: 'late_1', majorUnits: 100 }),
      invoice({ id: 'large', daysLate: 9, band: 'late_1', majorUnits: 90000 }),
    ])
    const column = columns[1]!
    const large = column.placed.find((p) => p.item.id === 'large')!
    const small = column.placed.find((p) => p.item.id === 'small')!
    const ideal = Math.round(((9 - 1) / 13) * (SLOTS_PER_COLUMN - 1))
    expect(large.slot).toBe(ideal)
    expect(small.slot).not.toBe(ideal)
  })

  it('scales chips within their own currency, never across (§7 forbids FX)', () => {
    const columns = packRail([
      invoice({ id: 'usd', currency: 'USD', majorUnits: 1000, daysLate: 5, band: 'late_1' }),
      invoice({ id: 'jpy', currency: 'JPY', majorUnits: 150000, daysLate: 8, band: 'late_1' }),
    ])
    const placed = columns[1]!.placed
    // Each is the largest in its own currency, so both are full height. A
    // cross-currency comparison would have crushed the dollar chip.
    expect(placed.find((p) => p.item.id === 'usd')?.scale).toBe(1)
    expect(placed.find((p) => p.item.id === 'jpy')?.scale).toBe(1)
  })

  it('is deterministic', () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      invoice({ id: `i${i}`, daysLate: i, band: 'late_1', majorUnits: 1000 + (i % 7) * 500 }),
    )
    const a = JSON.stringify(packRail(items))
    const b = JSON.stringify(packRail(items))
    expect(a).toBe(b)
  })

  it('keeps placed chips ordered left to right', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      invoice({ id: `i${i}`, daysLate: i + 1, band: 'late_1' }),
    )
    const slots = packRail(items)[1]!.placed.map((p) => p.slot)
    expect([...slots].sort((x, y) => x - y)).toEqual(slots)
  })
})
