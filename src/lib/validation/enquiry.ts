import { z } from 'zod'

/**
 * Optional free text. Accepts "", null or undefined - a cleared control can
 * send any of the three - and normalises them all to null.
 */
const optionalText = (max: number, label: string) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) return null
      const trimmed = value.trim()
      return trimmed === '' ? null : trimmed
    })
    .refine((value) => value === null || value.length <= max, {
      message: `${label} must be ${max} characters or fewer`,
    })

/** Optional id from a picker, normalised the same way. */
const optionalId = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

const optionalCalendarDate = optionalId.refine(
  (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
  { message: 'Enter a valid date' },
)

/**
 * A reference that must be chosen.
 *
 * Same normalisation as `optionalId` - a cleared picker can send "", null or
 * undefined - but all three are rejected rather than stored as null.
 */
const requiredId = (message: string) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value ?? '').trim())
    .refine((value) => value.length > 0, { message })

/** Accepts "1,250.50", "AED 1250", 1250 - rejects anything else. */
const optionalCurrency = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') return null
    const cleaned =
      typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(cleaned) ? cleaned : Number.NaN
  })
  .refine((value) => value === null || !Number.isNaN(value), { message: 'Enter a valid amount' })
  .refine((value) => value === null || value >= 0, { message: 'Quote value cannot be negative' })
  .refine((value) => value === null || value <= 99_999_999_999_999, {
    message: 'Quote value is too large',
  })

/**
 * The ten fields a request cannot be saved without.
 *
 * S.No and Job No are not among the form's inputs - both are generated on
 * save - but they are mandatory in the same sense: every record has them.
 * Everything else here is genuinely optional and may be left blank.
 */
export const enquiryFormSchema = z
  .object({
    enquiryDate: optionalCalendarDate,
    salesResponsibleId: requiredId('Select who is responsible for this request'),
    /**
     * The picker sends an existing customer id, or leaves it empty and sends
     * only `customerName` when the user chose "Add new customer".
     */
    customerId: optionalId,
    customerName: z
      .string()
      .trim()
      .min(1, 'Select a customer or add a new one')
      .max(200, 'Customer name must be 200 characters or fewer'),
    projectName: z
      .string()
      .trim()
      .min(1, 'Project name is required')
      .max(200, 'Project name must be 200 characters or fewer'),
    statusValueId: requiredId('Select a status'),
    locationValueId: requiredId('Select a location'),
    materialValueId: requiredId('Select a material'),
    enquiryDetails: z
      .string()
      .trim()
      .min(1, 'Enquiry details are required')
      .max(2000, 'Enquiry details must be 2000 characters or fewer'),
    quoteValue: optionalCurrency,
    probabilityValueId: requiredId('Select a probability'),
    expectedOrderDate: optionalCalendarDate,
    expectedBillingDate: optionalCalendarDate,
    email: optionalId.refine(
      (value) => value === null || z.string().email().safeParse(value).success,
      { message: 'Enter a valid email address' },
    ),
    phoneNumber: optionalText(60, 'Phone number'),
    remarks: optionalText(2000, 'Remarks'),
  })
  .refine(
    (data) =>
      !data.expectedBillingDate ||
      !data.expectedOrderDate ||
      data.expectedBillingDate >= data.expectedOrderDate,
    {
      message: 'Billing date cannot be before the order date',
      path: ['expectedBillingDate'],
    },
  )

export type EnquiryFormInput = z.input<typeof enquiryFormSchema>
export type EnquiryFormValues = z.infer<typeof enquiryFormSchema>

export const createEnquirySchema = z.object({
  companyId: z.string().min(1),
  data: enquiryFormSchema,
})

export const updateEnquirySchema = z.object({
  companyId: z.string().min(1),
  enquiryId: z.string().min(1),
  data: enquiryFormSchema,
})

export const deleteRequestSchema = z.object({
  companyId: z.string().min(1),
  enquiryId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(10, 'Please give at least 10 characters of context')
    .max(1000, 'Reason must be 1000 characters or fewer'),
})

export const deleteDecisionSchema = z.object({
  companyId: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optionalText(1000, 'Note'),
})

export type DeleteRequestInput = z.infer<typeof deleteRequestSchema>
export type DeleteDecisionInput = z.infer<typeof deleteDecisionSchema>

/** Blank form state, so the Add drawer and the Edit drawer share one shape. */
/** Creating a customer inline from the enquiry drawer. */
export const createCustomerSchema = z.object({
  companyId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(2, 'Customer name must be at least 2 characters')
    .max(200, 'Customer name must be 200 characters or fewer'),
  email: optionalId.refine(
    (value) => value === null || z.string().email().safeParse(value).success,
    { message: 'Enter a valid email address' },
  ),
  phone: optionalText(60, 'Phone number'),
})

export const updateCustomerSchema = createCustomerSchema.extend({
  customerId: z.string().min(1),
  isActive: z.coerce.boolean().default(true),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>

export const EMPTY_ENQUIRY_FORM: EnquiryFormInput = {
  enquiryDate: '',
  salesResponsibleId: '',
  customerId: '',
  customerName: '',
  projectName: '',
  statusValueId: '',
  locationValueId: '',
  materialValueId: '',
  enquiryDetails: '',
  quoteValue: '',
  probabilityValueId: '',
  expectedOrderDate: '',
  expectedBillingDate: '',
  email: '',
  phoneNumber: '',
  remarks: '',
}
