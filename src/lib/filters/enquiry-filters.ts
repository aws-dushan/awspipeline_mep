import { z } from 'zod'
import type { Prisma } from '@prisma/client'

import { normalizePhone, parseCalendarDate } from '@/lib/format'
import type { PipelineColumnKey } from '@/lib/pipeline/columns'

/**
 * The one filtering implementation.
 *
 * The pipeline grid, the row counter and the Excel exporter all build their
 * query through `buildEnquiryWhere`, which is the only reason "export the
 * filtered set" and "what is on screen" can never disagree.
 */

const trimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional()

const idList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => {
    const raw = Array.isArray(value) ? value : value.split(',')
    const cleaned = raw.map((item) => item.trim()).filter(Boolean)
    return cleaned.length > 0 ? Array.from(new Set(cleaned)) : undefined
  })
  .optional()

const numericValue = z
  .union([z.string(), z.number()])
  .transform((value) => {
    if (value === '' || value === null || value === undefined) return undefined
    const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
    return Number.isFinite(numeric) ? numeric : undefined
  })
  .optional()

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected yyyy-MM-dd')
  .optional()
  .or(z.literal('').transform(() => undefined))

export const SORTABLE_KEYS = [
  /*
   * Not a column any more, but still the sort that matters: the serial number
   * is the only strictly sequential value a request carries, so it is what
   * "newest first" means. Job numbers can no longer be compared - they read
   * J1000_DXB and sort as text.
   */
  'serialNo',
  'createdAt',
  'jobNo',
  'enquiryDate',
  'customerName',
  'projectName',
  'quoteValue',
  'expectedOrderDate',
  'expectedBillingDate',
  'updatedAt',
] as const

export type SortableKey = (typeof SORTABLE_KEYS)[number]

export const enquiryFilterSchema = z.object({
  // 1. Job No
  jobNo: trimmedString,
  // 3. Enquiry Date
  enquiryDateFrom: isoDate,
  enquiryDateTo: isoDate,
  // 4. Sales Responsible
  salesResponsible: idList,
  // 5. Customer Name
  customerName: trimmedString,
  // 6. Project Name
  projectName: trimmedString,
  // 7-9, 12. Admin-configured dropdowns
  status: idList,
  location: idList,
  material: idList,
  probability: idList,
  // 10. Enquiry Details
  enquiryDetails: trimmedString,
  // 11. Quote Value
  quoteValueMin: numericValue,
  quoteValueMax: numericValue,
  // 13. Expected Order Date
  expectedOrderDateFrom: isoDate,
  expectedOrderDateTo: isoDate,
  // 14. Expected Billing Date
  expectedBillingDateFrom: isoDate,
  expectedBillingDateTo: isoDate,
  // 15-17
  email: trimmedString,
  phoneNumber: trimmedString,
  remarks: trimmedString,

  /** Global quick search across the text columns. */
  q: trimmedString,

  sortBy: z.enum(SORTABLE_KEYS).optional().default('serialNo'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),

  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(200).optional().default(50),
})

export type EnquiryFilters = z.infer<typeof enquiryFilterSchema>
export type EnquiryFilterInput = z.input<typeof enquiryFilterSchema>

export const EMPTY_FILTERS: EnquiryFilters = enquiryFilterSchema.parse({})

export function parseEnquiryFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): EnquiryFilters {
  const raw: Record<string, unknown> = {}

  if (params instanceof URLSearchParams) {
    for (const key of new Set(params.keys())) {
      const all = params.getAll(key)
      raw[key] = all.length > 1 ? all : all[0]
    }
  } else {
    Object.assign(raw, params)
  }

  const parsed = enquiryFilterSchema.safeParse(raw)
  // A malformed query string should never 500 the pipeline - fall back to the
  // unfiltered view rather than failing the page.
  return parsed.success ? parsed.data : EMPTY_FILTERS
}

export function serializeEnquiryFilters(
  filters: Partial<EnquiryFilters>,
  options: { includePaging?: boolean } = {},
): URLSearchParams {
  const params = new URLSearchParams()
  const entries = Object.entries(filters) as [keyof EnquiryFilters, unknown][]

  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === '') continue
    if (!options.includePaging && (key === 'page' || key === 'pageSize')) continue
    if (key === 'sortBy' && value === 'serialNo') continue
    if (key === 'sortDir' && value === 'desc') continue

    if (Array.isArray(value)) {
      if (value.length === 0) continue
      params.set(key, value.join(','))
    } else {
      params.set(key, String(value))
    }
  }
  return params
}

/** Which grid columns currently carry a filter, for the header indicators. */
export function activeFilterColumns(filters: EnquiryFilters): Set<PipelineColumnKey> {
  const active = new Set<PipelineColumnKey>()
  const mark = (key: PipelineColumnKey, ...values: unknown[]) => {
    if (values.some((v) => v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0))) {
      active.add(key)
    }
  }

  mark('jobNo', filters.jobNo)
  mark('enquiryDate', filters.enquiryDateFrom, filters.enquiryDateTo)
  mark('salesResponsible', filters.salesResponsible)
  mark('customerName', filters.customerName)
  mark('projectName', filters.projectName)
  mark('status', filters.status)
  mark('location', filters.location)
  mark('material', filters.material)
  mark('enquiryDetails', filters.enquiryDetails)
  mark('quoteValue', filters.quoteValueMin, filters.quoteValueMax)
  mark('probability', filters.probability)
  mark('expectedOrderDate', filters.expectedOrderDateFrom, filters.expectedOrderDateTo)
  mark('expectedBillingDate', filters.expectedBillingDateFrom, filters.expectedBillingDateTo)
  mark('email', filters.email)
  mark('phoneNumber', filters.phoneNumber)
  mark('remarks', filters.remarks)

  return active
}

/**
 * How many *columns* are filtered.
 *
 * Counted per column rather than per key, so a single date range - which is
 * two keys and one chip - reads as one filter rather than two. The global
 * search box is counted separately since it has no column of its own.
 */
export function countActiveFilters(filters: EnquiryFilters): number {
  return activeFilterColumns(filters).size + (filters.q ? 1 : 0)
}

export function hasActiveFilters(filters: EnquiryFilters): boolean {
  return countActiveFilters(filters) > 0
}

/** Clears every filter for one column while leaving the others untouched. */
export function clearColumnFilter(
  filters: EnquiryFilters,
  column: PipelineColumnKey,
): EnquiryFilters {
  const next = { ...filters }
  const reset: Partial<Record<PipelineColumnKey, (keyof EnquiryFilters)[]>> = {
    jobNo: ['jobNo'],
    enquiryDate: ['enquiryDateFrom', 'enquiryDateTo'],
    salesResponsible: ['salesResponsible'],
    customerName: ['customerName'],
    projectName: ['projectName'],
    status: ['status'],
    location: ['location'],
    material: ['material'],
    enquiryDetails: ['enquiryDetails'],
    quoteValue: ['quoteValueMin', 'quoteValueMax'],
    probability: ['probability'],
    expectedOrderDate: ['expectedOrderDateFrom', 'expectedOrderDateTo'],
    expectedBillingDate: ['expectedBillingDateFrom', 'expectedBillingDateTo'],
    email: ['email'],
    phoneNumber: ['phoneNumber'],
    remarks: ['remarks'],
  }
  for (const key of reset[column] ?? []) {
    delete (next as Record<string, unknown>)[key]
  }
  return next
}

const contains = (value: string): Prisma.StringFilter => ({
  contains: value,
  mode: 'insensitive',
})

/** Inclusive date-range filter over a calendar-date column. */
function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const gte = parseCalendarDate(from ?? null)
  const toDate = parseCalendarDate(to ?? null)
  // `to` is inclusive of the whole day.
  const lte = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000 - 1) : null
  if (!gte && !lte) return undefined
  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  }
}

export type BuildWhereOptions = {
  companyId: string
  filters: EnquiryFilters
  /** Only an admin viewing deleted history may set this. Defaults to false. */
  includeDeleted?: boolean
  /** Restrict to soft-deleted rows only (admin deleted-records view). */
  deletedOnly?: boolean
}

/**
 * Build the Prisma `where` for a pipeline query.
 *
 * `companyId` is applied here and is not derived from anything the client
 * sends - callers pass the id that `requireCompanyAccess` already validated.
 */
export function buildEnquiryWhere({
  companyId,
  filters,
  includeDeleted = false,
  deletedOnly = false,
}: BuildWhereOptions): Prisma.EnquiryWhereInput {
  const and: Prisma.EnquiryWhereInput[] = []

  if (filters.jobNo) and.push({ jobNo: contains(filters.jobNo) })

  const enquiryDate = dateRange(filters.enquiryDateFrom, filters.enquiryDateTo)
  if (enquiryDate) and.push({ enquiryDate })

  if (filters.salesResponsible?.length) {
    and.push({ salesResponsibleId: { in: filters.salesResponsible } })
  }

  if (filters.customerName) and.push({ customerName: contains(filters.customerName) })
  if (filters.projectName) and.push({ projectName: contains(filters.projectName) })

  if (filters.status?.length) and.push({ statusValueId: { in: filters.status } })
  if (filters.location?.length) and.push({ locationValueId: { in: filters.location } })
  if (filters.material?.length) and.push({ materialValueId: { in: filters.material } })
  if (filters.probability?.length) and.push({ probabilityValueId: { in: filters.probability } })

  if (filters.enquiryDetails) and.push({ enquiryDetails: contains(filters.enquiryDetails) })

  if (filters.quoteValueMin !== undefined || filters.quoteValueMax !== undefined) {
    and.push({
      quoteValue: {
        ...(filters.quoteValueMin !== undefined ? { gte: filters.quoteValueMin } : {}),
        ...(filters.quoteValueMax !== undefined ? { lte: filters.quoteValueMax } : {}),
      },
    })
  }

  const orderDate = dateRange(filters.expectedOrderDateFrom, filters.expectedOrderDateTo)
  if (orderDate) and.push({ expectedOrderDate: orderDate })

  const billingDate = dateRange(filters.expectedBillingDateFrom, filters.expectedBillingDateTo)
  if (billingDate) and.push({ expectedBillingDate: billingDate })

  if (filters.email) and.push({ email: contains(filters.email) })

  if (filters.phoneNumber) {
    // Match on both the raw text and a digits-only form, so "+971 50" and
    // "97150" both find the same record.
    const digits = normalizePhone(filters.phoneNumber)
    and.push({
      OR: [
        { phoneNumber: contains(filters.phoneNumber) },
        ...(digits.length >= 3 ? [{ phoneNumber: contains(digits) }] : []),
      ],
    })
  }

  if (filters.remarks) and.push({ remarks: contains(filters.remarks) })

  if (filters.q) {
    and.push({
      OR: [
        { jobNo: contains(filters.q) },
        { customerName: contains(filters.q) },
        { projectName: contains(filters.q) },
        { enquiryDetails: contains(filters.q) },
        { email: contains(filters.q) },
        { phoneNumber: contains(filters.q) },
        { remarks: contains(filters.q) },
      ],
    })
  }

  return {
    companyId,
    ...(deletedOnly ? { isDeleted: true } : includeDeleted ? {} : { isDeleted: false }),
    ...(and.length > 0 ? { AND: and } : {}),
  }
}

export function buildEnquiryOrderBy(
  filters: EnquiryFilters,
): Prisma.EnquiryOrderByWithRelationInput[] {
  const direction = filters.sortDir ?? 'desc'
  const key = filters.sortBy ?? 'serialNo'

  // Default order is S.No descending, which puts the newest request on top:
  // the per-company counter only ever moves forward, so a new row always takes
  // the highest S.No. `id` breaks ties deterministically, so pagination can
  // never repeat or skip a row.
  if (key === 'serialNo') {
    return [{ serialNo: direction }, { id: direction }]
  }
  return [
    { [key]: direction } as Prisma.EnquiryOrderByWithRelationInput,
    { serialNo: 'desc' },
    { id: 'desc' },
  ]
}
