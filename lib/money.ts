/**
 * Money (D-003).
 *
 * Amounts are integer minor units plus an ISO-4217 code. No floats, ever, and
 * no arithmetic across currencies — §7 puts FX out of scope for v1, so a sum
 * over mixed currencies is not a rounding question, it is a bug. `totalsBy`
 * returns one figure per currency and the UI renders them side by side.
 */

export type Money = {
  readonly minor: bigint
  readonly currency: string
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} and ${b}. Nudge does not convert currencies.`)
    this.name = 'CurrencyMismatchError'
  }
}

export class AmountParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmountParseError'
  }
}

const fractionDigitsCache = new Map<string, number>()

/** 2 for most currencies, 0 for JPY/KRW, 3 for KWD/BHD. Asked of the runtime
 *  rather than hardcoded, so the table cannot go stale. */
export function fractionDigits(currency: string): number {
  const code = currency.toUpperCase()
  const cached = fractionDigitsCache.get(code)
  if (cached !== undefined) return cached
  let digits = 2
  try {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2
  } catch {
    throw new AmountParseError(`Unknown currency code "${currency}".`)
  }
  fractionDigitsCache.set(code, digits)
  return digits
}

export function money(minor: bigint | number | string, currency: string): Money {
  const code = currency.toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) throw new AmountParseError(`Invalid currency code "${currency}".`)
  return { minor: BigInt(minor), currency: code }
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency)
  return { minor: a.minor + b.minor, currency: a.currency }
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency)
  return { minor: a.minor - b.minor, currency: a.currency }
}

export function isZero(m: Money): boolean {
  return m.minor === 0n
}

/** Sum a mixed-currency list into one entry per currency, largest first. */
export function totalsByCurrency(items: readonly Money[]): Money[] {
  const byCode = new Map<string, bigint>()
  for (const m of items) byCode.set(m.currency, (byCode.get(m.currency) ?? 0n) + m.minor)
  return [...byCode.entries()]
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => (b.minor > a.minor ? 1 : b.minor < a.minor ? -1 : 0))
}

/**
 * "$2,400.00". Display only — never parsed back.
 * Minor units are divided by their scale at the last possible moment, and the
 * quotient is exact for every amount below ~$90 trillion.
 */
export function formatMoney(m: Money, locale = 'en-US'): string {
  const digits = fractionDigits(m.currency)
  const scale = 10 ** digits
  const value = Number(m.minor) / scale
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** "$2.4k" — for the rail and other tight spaces. Never on an invoice. */
export function formatMoneyCompact(m: Money, locale = 'en-US'): string {
  const digits = fractionDigits(m.currency)
  const value = Number(m.minor) / 10 ** digits
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Parse what a human types, or what an accounting package exports.
 *
 * Handles: "2400", "2,400.00", "$2,400.00", "2 400,00", "(1,234.00)" for
 * negatives, trailing/leading spaces, and a non-breaking space as a thousands
 * separator. Rejects anything with more decimal places than the currency has,
 * because silently dropping a digit of someone's money is not a rounding
 * decision we get to make.
 *
 * Phase 5's CSV mapper reuses this verbatim.
 */
export function parseAmountToMinor(input: string, currency: string): bigint {
  const digits = fractionDigits(currency)
  let s = input.trim()
  if (s === '') throw new AmountParseError('Enter an amount.')

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1).trim()
  }

  // Strip currency symbols, codes, and every flavour of space.
  s = s.replace(/[\p{Sc}]/gu, '').replace(/[A-Za-z]/g, '').replace(/[\s  ]/g, '')
  if (s === '') throw new AmountParseError(`"${input}" is not an amount.`)

  // Validate the shape before interpreting separators. Without this, "1.2.3.4"
  // quietly parses as 12.34 — the separator logic alone will happily strip its
  // way through nonsense. Accepts grouped ("1,234,567.89", "1.234.567,89"),
  // ungrouped ("1234.56") and bare-decimal (".50") forms.
  const SHAPE = /^(\d{1,3}([.,]\d{3})+([.,]\d+)?|\d+([.,]\d+)?|[.,]\d+)$/
  if (!SHAPE.test(s)) throw new AmountParseError(`"${input}" is not an amount.`)

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decimalSep: '.' | ',' | null = null

  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever comes last is the decimal separator: 1.234,56 vs 1,234.56
    decimalSep = lastComma > lastDot ? ',' : '.'
  } else if (lastComma !== -1) {
    // A lone comma is a decimal separator unless the string looks like a
    // thousands group: "1,234" is one thousand two hundred, "1,23" is not.
    // A leading zero rules the group reading out — nobody writes "0,001"
    // meaning one — so that falls through to the too-many-decimals error.
    const after = s.length - lastComma - 1
    decimalSep = after === 3 && /^[1-9]\d{0,2}(,\d{3})+$/.test(s) ? null : ','
  } else if (lastDot !== -1) {
    const after = s.length - lastDot - 1
    decimalSep = after === 3 && /^[1-9]\d{0,2}(\.\d{3})+$/.test(s) ? null : '.'
  }

  let whole: string
  let fraction: string
  if (decimalSep === null) {
    whole = s.replace(/[.,]/g, '')
    fraction = ''
  } else {
    const idx = decimalSep === ',' ? lastComma : lastDot
    whole = s.slice(0, idx).replace(/[.,]/g, '')
    fraction = s.slice(idx + 1)
  }

  if (whole === '') whole = '0'
  if (!/^\d+$/.test(whole) || (fraction !== '' && !/^\d+$/.test(fraction))) {
    throw new AmountParseError(`"${input}" is not an amount.`)
  }
  if (fraction.length > digits) {
    throw new AmountParseError(
      digits === 0
        ? `${currency.toUpperCase()} amounts have no decimal places.`
        : `Too many decimal places for ${currency.toUpperCase()} — use at most ${digits}.`,
    )
  }

  const padded = fraction.padEnd(digits, '0')
  const minor = BigInt(whole + padded)
  return negative ? -minor : minor
}

/** Minor units as a plain decimal string, for form fields. No grouping. */
export function minorToInput(m: Money): string {
  const digits = fractionDigits(m.currency)
  const negative = m.minor < 0n
  const abs = (negative ? -m.minor : m.minor).toString().padStart(digits + 1, '0')
  const whole = abs.slice(0, abs.length - digits) || '0'
  const fraction = digits === 0 ? '' : `.${abs.slice(abs.length - digits)}`
  return `${negative ? '-' : ''}${whole}${fraction}`
}
