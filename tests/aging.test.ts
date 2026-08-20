import { describe, expect, it } from 'vitest'
import { agingPhrase, bandFor, BAND_META, chipScale, columnFor, daysLate, railPosition } from '@/lib/aging'

describe('daysLate', () => {
  it('is positive when overdue and negative when not', () => {
    expect(daysLate('2026-08-12', '2026-08-21')).toBe(9)
    expect(daysLate('2026-08-25', '2026-08-21')).toBe(-4)
    expect(daysLate('2026-08-21', '2026-08-21')).toBe(0)
  })
})

describe('bandFor', () => {
  it('places the boundaries exactly where §3 says', () => {
    expect(bandFor(-1)).toBe('not_due')
    expect(bandFor(0)).toBe('due_today')
    expect(bandFor(1)).toBe('late_1')
    expect(bandFor(14)).toBe('late_1')
    expect(bandFor(15)).toBe('late_2')
    expect(bandFor(34)).toBe('late_2')
    expect(bandFor(35)).toBe('late_3')
    expect(bandFor(4000)).toBe('late_3')
  })
})

describe('BAND_META', () => {
  it('never uses a raw aging colour as text (D-011)', () => {
    // amber-500 and mint-300 fail WCAG AA on paper; their text tokens differ
    // from their fills. If someone "simplifies" these to match, this fails.
    expect(BAND_META.late_1.text).not.toBe(BAND_META.late_1.fill)
    expect(BAND_META.paid.text).not.toBe(BAND_META.paid.fill)
  })

  it('gives every band a label, so colour is never the only signal', () => {
    for (const meta of Object.values(BAND_META)) {
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.columnLabel.length).toBeGreaterThan(0)
    }
  })
})

describe('columnFor', () => {
  it('folds due-today and paid into the first column', () => {
    expect(columnFor('not_due')).toBe('not_due')
    expect(columnFor('due_today')).toBe('not_due')
    expect(columnFor('paid')).toBe('not_due')
    expect(columnFor('late_3')).toBe('late_3')
  })
})

describe('railPosition', () => {
  it('puts each band in its own column', () => {
    expect(railPosition(-5).column).toBe('not_due')
    expect(railPosition(0).column).toBe('not_due')
    expect(railPosition(7).column).toBe('late_1')
    expect(railPosition(20).column).toBe('late_2')
    expect(railPosition(60).column).toBe('late_3')
  })

  it('always returns a fraction inside the column', () => {
    for (let d = -400; d <= 800; d += 1) {
      const { t } = railPosition(d)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    }
  })

  it('increases monotonically with lateness inside a band', () => {
    expect(railPosition(1).t).toBeLessThan(railPosition(7).t)
    expect(railPosition(7).t).toBeLessThan(railPosition(14).t)
    expect(railPosition(15).t).toBeLessThan(railPosition(34).t)
  })

  it('compresses the tail instead of running off the end', () => {
    // 35 -> 90 days spends 70% of the band; 90 -> 365 spends the last 30%.
    expect(railPosition(90).t).toBeCloseTo(0.7, 2)
    expect(railPosition(365).t).toBeCloseTo(1, 2)
    // Anything older is pinned rather than lost.
    expect(railPosition(400).t).toBe(1)
    expect(railPosition(4000).t).toBe(1)
  })

  it('parks invoices further out than two weeks at the left edge', () => {
    expect(railPosition(-14).t).toBe(0)
    expect(railPosition(-90).t).toBe(0)
    expect(railPosition(0).t).toBe(1)
  })
})

describe('chipScale', () => {
  it('is zero when there is nothing to scale against', () => {
    expect(chipScale(100, 0)).toBe(0)
  })

  it('maxes out at the largest invoice in that currency', () => {
    expect(chipScale(5000, 5000)).toBe(1)
  })

  it('uses a square root so one big invoice does not flatten the rest', () => {
    // A quarter of the largest amount still reads as half the height.
    expect(chipScale(2500, 10000)).toBeCloseTo(0.5, 5)
  })

  it('stays in range for absurd inputs', () => {
    expect(chipScale(-5, 100)).toBe(0)
    expect(chipScale(1e9, 100)).toBe(1)
  })
})

describe('agingPhrase', () => {
  it('reads like a person wrote it', () => {
    expect(agingPhrase(0)).toBe('due today')
    expect(agingPhrase(-1)).toBe('due tomorrow')
    expect(agingPhrase(-3)).toBe('due in 3 days')
    expect(agingPhrase(1)).toBe('1 day late')
    expect(agingPhrase(9)).toBe('9 days late')
  })
})
