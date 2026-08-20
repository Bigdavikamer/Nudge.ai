import { describe, expect, it } from 'vitest'
import {
  addMoney,
  AmountParseError,
  CurrencyMismatchError,
  formatMoney,
  fractionDigits,
  minorToInput,
  money,
  parseAmountToMinor,
  totalsByCurrency,
} from '@/lib/money'

describe('fractionDigits', () => {
  it('knows the common cases', () => {
    expect(fractionDigits('USD')).toBe(2)
    expect(fractionDigits('EUR')).toBe(2)
    expect(fractionDigits('JPY')).toBe(0)
    expect(fractionDigits('KWD')).toBe(3)
  })

  it('is case insensitive', () => {
    expect(fractionDigits('usd')).toBe(2)
  })
})

describe('parseAmountToMinor', () => {
  it('parses the plain cases', () => {
    expect(parseAmountToMinor('2400', 'USD')).toBe(240000n)
    expect(parseAmountToMinor('2400.00', 'USD')).toBe(240000n)
    expect(parseAmountToMinor('0.05', 'USD')).toBe(5n)
  })

  it('survives the messy export (§2.1)', () => {
    expect(parseAmountToMinor('1,234.00', 'USD')).toBe(123400n)
    expect(parseAmountToMinor('$1,234.00', 'USD')).toBe(123400n)
    expect(parseAmountToMinor('  $ 1,234.00  ', 'USD')).toBe(123400n)
    expect(parseAmountToMinor('1 234,00', 'EUR')).toBe(123400n)
    expect(parseAmountToMinor('1.234,56', 'EUR')).toBe(123456n)
    expect(parseAmountToMinor('1,234.56', 'USD')).toBe(123456n)
    expect(parseAmountToMinor('£415', 'GBP')).toBe(41500n)
    expect(parseAmountToMinor('1234.5', 'USD')).toBe(123450n)
  })

  it('distinguishes a thousands comma from a decimal comma', () => {
    // "1,234" is one thousand two hundred and thirty four.
    expect(parseAmountToMinor('1,234', 'USD')).toBe(123400n)
    // "1,23" cannot be a thousands group, so it is a decimal.
    expect(parseAmountToMinor('1,23', 'EUR')).toBe(123n)
  })

  it('handles accounting-style negatives', () => {
    expect(parseAmountToMinor('(1,234.00)', 'USD')).toBe(-123400n)
    expect(parseAmountToMinor('-99.99', 'USD')).toBe(-9999n)
  })

  it('respects zero-decimal currencies', () => {
    expect(parseAmountToMinor('5000', 'JPY')).toBe(5000n)
    expect(() => parseAmountToMinor('5000.50', 'JPY')).toThrow(AmountParseError)
  })

  it('refuses to silently drop a digit of someone’s money', () => {
    expect(() => parseAmountToMinor('10.5005', 'USD')).toThrow(/at most 2/)
    expect(() => parseAmountToMinor('0.001', 'USD')).toThrow(/at most 2/)
  })

  it('reads a lone separator with three digits after it as a thousands group', () => {
    // "10.005" is genuinely ambiguous: ten thousand and five in de-DE, or an
    // over-precise ten dollars in en-US. Real exports write the former far
    // more often than humans write the latter, so that is the reading — and
    // the entry form echoes the parsed figure back before you can submit it,
    // which is where an ambiguity like this actually gets resolved.
    expect(parseAmountToMinor('10.005', 'USD')).toBe(1000500n)
    expect(parseAmountToMinor('10,005', 'EUR')).toBe(1000500n)
  })

  it('rejects nonsense', () => {
    expect(() => parseAmountToMinor('', 'USD')).toThrow(AmountParseError)
    expect(() => parseAmountToMinor('abc', 'USD')).toThrow(AmountParseError)
    expect(() => parseAmountToMinor('1.2.3.4', 'USD')).toThrow(AmountParseError)
  })

  it('round-trips through minorToInput', () => {
    for (const input of ['2400.00', '0.05', '19.99', '1000000.00']) {
      const minor = parseAmountToMinor(input, 'USD')
      expect(minorToInput(money(minor, 'USD'))).toBe(input)
    }
  })
})

describe('arithmetic', () => {
  it('adds within a currency', () => {
    expect(addMoney(money(100n, 'USD'), money(250n, 'USD'))).toEqual({
      minor: 350n,
      currency: 'USD',
    })
  })

  it('refuses to add across currencies — v1 has no FX (§7)', () => {
    expect(() => addMoney(money(100n, 'USD'), money(100n, 'EUR'))).toThrow(CurrencyMismatchError)
  })

  it('totals per currency instead of summing them together', () => {
    const totals = totalsByCurrency([
      money(100n, 'USD'),
      money(250n, 'EUR'),
      money(400n, 'USD'),
    ])
    expect(totals).toHaveLength(2)
    expect(totals.find((t) => t.currency === 'USD')?.minor).toBe(500n)
    expect(totals.find((t) => t.currency === 'EUR')?.minor).toBe(250n)
  })

  it('stays exact past the float boundary', () => {
    // 90 trillion dollars in cents, plus one cent.
    const huge = money(9_000_000_000_000_000n, 'USD')
    expect(addMoney(huge, money(1n, 'USD')).minor).toBe(9_000_000_000_000_001n)
  })
})

describe('formatMoney', () => {
  it('formats with the right number of places', () => {
    expect(formatMoney(money(240000n, 'USD'))).toBe('$2,400.00')
    expect(formatMoney(money(5000n, 'JPY'))).toBe('¥5,000')
  })
})
