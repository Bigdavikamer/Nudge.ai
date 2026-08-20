'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getClock } from '../adapters/clock'
import { requireSession } from '../auth'
import {
  createInvoice,
  DuplicateInvoiceNumberError,
  markPaid,
  markUnpaid,
} from '../db/repos/invoices'
import { refreshReliability } from '../db/repos/dashboard'
import { daysBetween, isValidIsoDate } from '../dates'
import { AmountParseError, parseAmountToMinor } from '../money'

export type FormState = {
  ok: boolean
  formError?: string
  fieldErrors?: Record<string, string>
  /**
   * What the user actually typed, echoed back.
   *
   * React 19 resets an uncontrolled form once its action resolves, so without
   * this a mistyped email address silently empties the other seven fields.
   * The form feeds these back in as defaultValue.
   */
  values?: Record<string, string>
}

const isoDate = z.string().refine(isValidIsoDate, { message: 'Use the date picker.' })

const createSchema = z.object({
  clientName: z.string().trim().min(1, 'Who is this invoice for?'),
  clientEmail: z.string().trim().toLowerCase().email('That does not look like an email address.'),
  invoiceNumber: z.string().trim().min(1, 'Give it the number your invoice already has.'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a three-letter code, like USD.'),
  amount: z.string().trim().min(1, 'Enter an amount.'),
  issueDate: isoDate,
  dueDate: isoDate,
  paymentUrl: z.union([z.string().trim().url('That is not a valid link.'), z.literal('')]),
  lateFeeTerms: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
})

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !out[key]) out[key] = issue.message
  }
  return out
}

export async function createInvoiceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession()

  const raw: Record<string, string> = {}
  for (const key of [
    'clientName',
    'clientEmail',
    'invoiceNumber',
    'currency',
    'amount',
    'issueDate',
    'dueDate',
    'paymentUrl',
    'lateFeeTerms',
    'notes',
  ]) {
    raw[key] = String(formData.get(key) ?? '')
  }

  const parsed = createSchema.safeParse({
    clientName: formData.get('clientName') ?? '',
    clientEmail: formData.get('clientEmail') ?? '',
    invoiceNumber: formData.get('invoiceNumber') ?? '',
    currency: formData.get('currency') ?? '',
    amount: formData.get('amount') ?? '',
    issueDate: formData.get('issueDate') ?? '',
    dueDate: formData.get('dueDate') ?? '',
    paymentUrl: formData.get('paymentUrl') ?? '',
    lateFeeTerms: formData.get('lateFeeTerms') ?? '',
    notes: formData.get('notes') ?? '',
  })

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: raw }
  }
  const input = parsed.data

  if (daysBetween(input.issueDate, input.dueDate) < 0) {
    return {
      ok: false,
      fieldErrors: { dueDate: 'The due date comes before the issue date.' },
      values: raw,
    }
  }

  let amountMinor: bigint
  try {
    amountMinor = parseAmountToMinor(input.amount, input.currency)
  } catch (error) {
    if (error instanceof AmountParseError) {
      return { ok: false, fieldErrors: { amount: error.message }, values: raw }
    }
    throw error
  }

  if (amountMinor <= 0n) {
    return {
      ok: false,
      fieldErrors: { amount: 'An invoice has to be for more than nothing.' },
      values: raw,
    }
  }

  let created: { id: string }
  try {
    created = await createInvoice(session.orgId, session.userId, {
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      invoiceNumber: input.invoiceNumber,
      currency: input.currency,
      amountMinor,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      paymentUrl: input.paymentUrl || null,
      lateFeeTerms: input.lateFeeTerms || null,
      notes: input.notes || null,
    })
  } catch (error) {
    if (error instanceof DuplicateInvoiceNumberError) {
      return { ok: false, fieldErrors: { invoiceNumber: error.message }, values: raw }
    }
    throw error
  }

  revalidatePath('/')
  revalidatePath('/invoices')
  revalidatePath('/clients')
  redirect(`/invoices/${created.id}`)
}

export async function markPaidAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('No invoice id.')

  await markPaid(session.orgId, id, session.userId, getClock().now())
  await refreshReliability(session.orgId, session.timezone)

  revalidatePath('/')
  revalidatePath('/invoices')
  revalidatePath('/clients')
  revalidatePath(`/invoices/${id}`)
}

export async function markUnpaidAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('No invoice id.')

  await markUnpaid(session.orgId, id, session.userId)
  await refreshReliability(session.orgId, session.timezone)

  revalidatePath('/')
  revalidatePath('/invoices')
  revalidatePath('/clients')
  revalidatePath(`/invoices/${id}`)
}
