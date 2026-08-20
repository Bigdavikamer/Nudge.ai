'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createInvoiceAction, type FormState } from '@/lib/actions/invoices'
import { AmountParseError, formatMoney, money, parseAmountToMinor } from '@/lib/money'

/**
 * Echoes back what the amount actually parsed to.
 *
 * "1.234" means one thousand two hundred in half of Europe and one and a bit
 * in the other half. The parser has to pick a reading; showing the result
 * before submit is what stops that guess from costing someone a factor of a
 * thousand. Same pure function the server uses.
 */
function ParsedAmount({ amount, currency }: { amount: string; currency: string }) {
  if (!amount.trim() || !/^[A-Za-z]{3}$/.test(currency)) return null
  try {
    const minor = parseAmountToMinor(amount, currency)
    if (minor <= 0n) return <span className="hint">An invoice has to be for more than nothing.</span>
    return (
      <span className="hint">
        Reads as <strong className="num">{formatMoney(money(minor, currency))}</strong>
      </span>
    )
  } catch (error) {
    if (error instanceof AmountParseError) return <span className="hint">{error.message}</span>
    return null
  }
}

const INITIAL: FormState = { ok: true }

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {hint && !error && (
        <span className="hint" id={`${name}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${name}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? 'Adding…' : 'Add invoice'}
    </button>
  )
}

export function InvoiceForm({
  defaultIssueDate,
  defaultDueDate,
  defaultCurrency,
}: {
  defaultIssueDate: string
  defaultDueDate: string
  defaultCurrency: string
}) {
  const [state, formAction] = useActionState(createInvoiceAction, INITIAL)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const errors = state.fieldErrors ?? {}
  // React 19 resets the form once the action resolves, so a failed submit
  // would otherwise wipe every uncontrolled field. Re-seeding defaultValue
  // from what the server echoed back is what makes the reset land on the
  // user's own input instead of on an empty string.
  const kept = state.values ?? {}

  const invalid = (name: string) =>
    errors[name] ? ({ 'aria-invalid': true, 'aria-describedby': `${name}-error` } as const) : {}

  return (
    <form action={formAction} className="stack" noValidate>
      {state.formError && (
        <p className="form-error" role="alert">
          {state.formError}
        </p>
      )}

      <div className="form-grid">
        <Field name="clientName" label="Client" error={errors.clientName}>
          <input
            id="clientName"
            name="clientName"
            defaultValue={kept.clientName ?? ''}
            required
            autoComplete="organization"
            {...invalid('clientName')}
          />
        </Field>

        <Field
          name="clientEmail"
          label="Client email"
          hint="Where the chase will go, from Phase 3."
          error={errors.clientEmail}
        >
          <input
            id="clientEmail"
            name="clientEmail"
            type="email"
            defaultValue={kept.clientEmail ?? ''}
            required
            autoComplete="email"
            {...invalid('clientEmail')}
          />
        </Field>

        <Field
          name="invoiceNumber"
          label="Invoice number"
          hint="The number already on your invoice."
          error={errors.invoiceNumber}
        >
          <input
            id="invoiceNumber"
            name="invoiceNumber"
            className="num"
            defaultValue={kept.invoiceNumber ?? ''}
            required
            {...invalid('invoiceNumber')}
          />
        </Field>

        <div className="field">
          <label htmlFor="amount">Amount</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: 'var(--space-2)' }}>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="2,400.00"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              {...invalid('amount')}
            />
            <input
              id="currency"
              name="currency"
              className="num"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              aria-label="Currency"
              {...invalid('currency')}
            />
          </div>
          {errors.amount && (
            <span className="field-error" id="amount-error" role="alert">
              {errors.amount}
            </span>
          )}
          {errors.currency && (
            <span className="field-error" id="currency-error" role="alert">
              {errors.currency}
            </span>
          )}
          {!errors.amount && !errors.currency && amount.trim() === '' && (
            <span className="hint">Commas, symbols and spaces are fine.</span>
          )}
          {!errors.amount && !errors.currency && (
            <ParsedAmount amount={amount} currency={currency} />
          )}
        </div>

        <Field name="issueDate" label="Issued" error={errors.issueDate}>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={kept.issueDate || defaultIssueDate}
            required
            {...invalid('issueDate')}
          />
        </Field>

        <Field name="dueDate" label="Due" error={errors.dueDate}>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={kept.dueDate || defaultDueDate}
            required
            {...invalid('dueDate')}
          />
        </Field>

        <div className="span-2">
          <Field
            name="paymentUrl"
            label="Payment link"
            hint="Optional. Included in every chase, so they can pay without replying."
            error={errors.paymentUrl}
          >
            <input
              id="paymentUrl"
              name="paymentUrl"
              type="url"
              defaultValue={kept.paymentUrl ?? ''}
              placeholder="https://"
              {...invalid('paymentUrl')}
            />
          </Field>
        </div>

        <div className="span-2">
          <Field
            name="lateFeeTerms"
            label="Late fee terms"
            hint="Optional. Quoted word for word if it is ever cited — never invented."
            error={errors.lateFeeTerms}
          >
            <input
              id="lateFeeTerms"
              name="lateFeeTerms"
              defaultValue={kept.lateFeeTerms ?? ''}
              placeholder="2% per month after 30 days"
              {...invalid('lateFeeTerms')}
            />
          </Field>
        </div>

        <div className="span-2">
          <Field name="notes" label="Notes" hint="Only you see these." error={errors.notes}>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={kept.notes ?? ''}
              {...invalid('notes')}
            />
          </Field>
        </div>
      </div>

      <div className="btn-row">
        <Submit />
      </div>
    </form>
  )
}
