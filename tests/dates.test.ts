import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayOfWeek,
  daysBetween,
  isValidIsoDate,
  isWeekend,
  startOfMonth,
  todayInZone,
} from '@/lib/dates'

describe('isValidIsoDate', () => {
  it('accepts real dates', () => {
    expect(isValidIsoDate('2026-08-19')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true)
  })

  it('rejects impossible ones', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2025-02-29')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('19/08/2026')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
  })
})

describe('todayInZone', () => {
  it('is a different calendar day either side of the date line', () => {
    const instant = new Date('2026-08-19T11:30:00Z')
    expect(todayInZone(instant, 'Pacific/Auckland')).toBe('2026-08-19')
    expect(todayInZone(instant, 'America/Los_Angeles')).toBe('2026-08-19')

    const lateEvening = new Date('2026-08-19T23:30:00Z')
    expect(todayInZone(lateEvening, 'Pacific/Auckland')).toBe('2026-08-20')
    expect(todayInZone(lateEvening, 'America/Los_Angeles')).toBe('2026-08-19')
  })

  it('handles the instant before midnight UTC', () => {
    const instant = new Date('2026-08-19T23:59:59Z')
    expect(todayInZone(instant, 'UTC')).toBe('2026-08-19')
    expect(todayInZone(instant, 'Europe/London')).toBe('2026-08-20')
  })
})

describe('daysBetween', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-08-12', '2026-08-21')).toBe(9)
    expect(daysBetween('2026-08-21', '2026-08-12')).toBe(-9)
    expect(daysBetween('2026-08-12', '2026-08-12')).toBe(0)
  })

  it('is unaffected by daylight saving transitions', () => {
    // US spring forward, 2026-03-08. A naive local-time subtraction returns
    // 0.958 days here and rounds to the wrong answer half the time.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    // EU autumn back, 2026-10-25.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('crosses years and leap days', () => {
    expect(daysBetween('2023-12-31', '2024-01-01')).toBe(1)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1)
  })
})

describe('addDays', () => {
  it('moves forward and back across month ends', () => {
    expect(addDays('2026-08-19', 14)).toBe('2026-09-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('is the inverse of daysBetween', () => {
    expect(daysBetween('2026-01-15', addDays('2026-01-15', 37))).toBe(37)
  })
})

describe('weekends', () => {
  it('knows which day of the week a date is', () => {
    expect(dayOfWeek('2026-08-19')).toBe(3) // Wednesday
    expect(isWeekend('2026-08-22')).toBe(true) // Saturday
    expect(isWeekend('2026-08-23')).toBe(true) // Sunday
    expect(isWeekend('2026-08-21')).toBe(false) // Friday
  })
})

describe('startOfMonth', () => {
  it('returns the first', () => {
    expect(startOfMonth('2026-08-19')).toBe('2026-08-01')
    expect(startOfMonth('2026-01-01')).toBe('2026-01-01')
  })
})
