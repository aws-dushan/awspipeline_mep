import { z } from 'zod'

/**
 * The quotation model shared by the editor and the server.
 *
 * Deliberately free of `server-only` and of any database import: the editor
 * validates and totals with exactly the same code the server saves with, so
 * the figure on screen is the figure that is stored and printed.
 */

export type QuotationItem = {
  description: string
  make: string
  qty: number
  unitPrice: number
}

export type QuotationTerm = {
  /** Empty for a free-standing note, printed across the full width. */
  label: string
  text: string
}

/** Everything printed on one version of a quotation. Dates are `yyyy-MM-dd`. */
export type QuotationFormValues = {
  quotationDate: string
  validUntil: string | null
  salesName: string
  salesPhone: string
  salesEmail: string
  customerName: string
  attention: string
  attentionPhone: string
  customerAddress: string
  customerEmail: string
  customerRef: string
  enquiryDate: string | null
  items: QuotationItem[]
  /**
   * The "Special Discounted Price": a final figure agreed below the total.
   * Null for no discount. Printed under the total, and the price the request
   * is quoted at.
   */
  discountedPrice: number | null
  scopeOfWork: string
  vatNote: string
  terms: QuotationTerm[]
}

/** A company's letterhead, reference prefix and the defaults a new quotation starts from. */
export type QuotationSettingsValues = {
  letterheadName: string
  address: string
  contactNumber: string
  footerText: string
  defaultScope: string
  vatNote: string
  defaultTerms: QuotationTerm[]
}

/**
 * The defaults a company starts from before an administrator changes them.
 * Taken from the quotation the sales team issued by hand, so the first
 * generated quotation reads like the ones customers already receive.
 */
export const DEFAULT_QUOTATION_SETTINGS: QuotationSettingsValues = {
  letterheadName: 'ABDULWAHED BIN SHABIB DISTRIBUTION (BR OF AW BIN SHABIB INVESTMENT L.L.C)',
  address:
    'BLOCK 3, 2ND FLOOR, OFFICE NO.214-224\nBIN SHABIB MALL AL QUSAIS INDUSTRIAL AREA-1, DUBAI, UAE',
  contactNumber: '971 4 23 52 333',
  footerText: 'Branches: Europe, Saudi Arabia, Kuwait, Bahrain, Qatar, Oman',
  defaultScope: 'SUPPLY OF EQUIPMENT ONLY',
  vatNote: 'Price is Exclusive of 5% VAT as applicable from January 1, 2018',
  // The sales team's standard terms, word for word.
  defaultTerms: [
    { label: 'Validity of offer:', text: '30 days from the date of this offer.' },
    { label: 'Delivery:', text: 'Ex-stock, subject to prior sale.' },
    {
      label: 'Delivery Terms:',
      text: 'The delivery can be arranged for a minimum purchase 5 Units and delivery lead time will be 2- 3 working days from the date of confirmed order with payment. The delivery will be made in one lot / location. Offloading & rigging at site is not included.',
    },
    {
      label: 'Order Confirmation:',
      text: 'Orders shall be considered confirmed only upon receipt of official purchase order and payment as per the quotation terms',
    },
    { label: 'Payment Terms :', text: '100 % advance payment prior to delivery.' },
    {
      label: 'Warranty :',
      text: '12 months for unit and 5 years on the compressor from the date of delivery (As per warranty terms & Conditions)',
    },
    {
      label: 'Warehouse Fee:',
      text: 'A warehouse fee of 2% will be charged per month against all non-collected and or / non-delivered goods. These charges will become applicable (3) days from the agreed delivery date.',
    },
    {
      label: 'Order Cancellation:',
      text: 'An order cancellation and reduction of quantity shall not be acceptable once order is placed.',
    },
  ],
}

/**
 * A quotation's reference: AWS/<location code>/<Job No>, e.g. AWS/AUH/J11292.
 *
 * Derived, never typed: the request's Job No is unique within the company, so
 * the reference is too. A request with no location reads AWS/<Job No>.
 */
export function buildReference(locationCode: string | null, jobNo: string): string {
  return ['AWS', locationCode?.trim(), jobNo.trim()].filter(Boolean).join('/')
}

/** The sales contact as printed: "971 4 23 52 333 ; EXT: 6494". */
export function formatSalesPhone(phone: string | null, ext: string | null): string {
  const number = phone?.trim() ?? ''
  const extension = ext?.trim() ?? ''
  if (!number) return extension ? `EXT: ${extension}` : ''
  return extension ? `${number} ; EXT: ${extension}` : number
}

/** R0, R1, ... - how a revision is printed and named. */
export function revisionLabel(revision: number): string {
  return `R${revision}`
}

/** Rounded to fils, so the total never carries floating-point dust. */
function money(value: number): number {
  return Math.round(value * 100) / 100
}

export function lineTotal(item: Pick<QuotationItem, 'qty' | 'unitPrice'>): number {
  const qty = Number(item.qty)
  const price = Number(item.unitPrice)
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0
  return money(qty * price)
}

export function quotationTotal(items: Pick<QuotationItem, 'qty' | 'unitPrice'>[]): number {
  return money(items.reduce((sum, item) => sum + lineTotal(item), 0))
}

/** What the customer is asked to pay: the discounted price when there is one. */
export function quotationPayable(values: {
  items: Pick<QuotationItem, 'qty' | 'unitPrice'>[]
  discountedPrice: number | null
}): number {
  return values.discountedPrice ?? quotationTotal(values.items)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`)
const optionalDate = z
  .string()
  .trim()
  .regex(DATE, 'Enter a valid date')
  .nullable()
  .or(z.literal('').transform(() => null))

const termSchema = z.object({
  label: text(80),
  text: text(1000).min(1, 'Enter the term, or remove it'),
})

export const quotationItemSchema = z.object({
  description: text(2000).min(1, 'Describe the item'),
  make: text(120),
  qty: z.coerce
    .number({ invalid_type_error: 'Enter a quantity' })
    .positive('Quantity must be more than zero')
    .max(1_000_000, 'Quantity is too large'),
  unitPrice: z.coerce
    .number({ invalid_type_error: 'Enter a price' })
    .min(0, 'Price cannot be negative')
    .max(1_000_000_000, 'Price is too large'),
})

export const quotationFormSchema = z.object({
  quotationDate: z.string().trim().regex(DATE, 'Enter the quotation date'),
  validUntil: optionalDate,
  salesName: text(120),
  salesPhone: text(120),
  salesEmail: text(160),
  customerName: text(200).min(1, 'Enter the customer name'),
  attention: text(160),
  attentionPhone: text(80),
  customerAddress: text(500),
  customerEmail: text(160),
  customerRef: text(500),
  enquiryDate: optionalDate,
  items: z.array(quotationItemSchema).min(1, 'Add at least one item').max(200, 'Too many items'),
  discountedPrice: z
    .union([z.literal(''), z.null(), z.undefined(), z.coerce.number({ invalid_type_error: 'Enter a price' })])
    .transform((value) => (value === '' || value === null || value === undefined ? null : Math.round(value * 100) / 100))
    .refine((value) => value === null || value >= 0, 'The price cannot be negative'),
  scopeOfWork: text(500),
  vatNote: text(300),
  terms: z.array(termSchema).max(30, 'Too many terms'),
}).superRefine((values, context) => {
  // A "discounted" price at or above the total is not a discount; it would
  // print a second, larger figure under the total and confuse the customer.
  if (values.discountedPrice !== null && values.discountedPrice >= quotationTotal(values.items)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountedPrice'],
      message: 'The discounted price must be below the total',
    })
  }
})

export const quotationSettingsSchema = z.object({
  letterheadName: text(200).min(1, 'Enter the letterhead name'),
  address: text(500),
  contactNumber: text(120),
  footerText: text(500),
  defaultScope: text(500),
  vatNote: text(300),
  defaultTerms: z.array(termSchema).max(30, 'Too many terms'),
})

/** What the save action is asked to do with the values. */
export const SAVE_MODES = ['new-version', 'update-version'] as const
export type SaveMode = (typeof SAVE_MODES)[number]

export const saveQuotationSchema = z.object({
  companyId: z.string().min(1),
  enquiryId: z.string().min(1),
  /** The version the editor was showing; absent when creating the first. */
  versionId: z.string().min(1).nullable(),
  mode: z.enum(SAVE_MODES),
  data: quotationFormSchema,
})

export const updateQuotationSettingsSchema = z.object({
  companyId: z.string().min(1),
  data: quotationSettingsSchema,
})

/** The stored JSON, read defensively: a malformed row prints as empty rather than crashing. */
export function readItems(value: unknown): QuotationItem[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>
    return {
      description: String(item.description ?? ''),
      make: String(item.make ?? ''),
      qty: Number(item.qty ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
    }
  })
}

export function readTerms(value: unknown): QuotationTerm[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const term = (raw ?? {}) as Record<string, unknown>
    return { label: String(term.label ?? ''), text: String(term.text ?? '') }
  })
}

/** `<Job No>_ <Customer> -QUOTATION-R<n>.pdf`, the name the team already files under. */
export function quotationFilename(jobNo: string, customerName: string, revision: number): string {
  const safe = (value: string) =>
    value
      .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return `${safe(jobNo)}_ ${safe(customerName).slice(0, 80)} -QUOTATION-${revisionLabel(revision)}.pdf`
}
