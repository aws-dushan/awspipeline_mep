import 'server-only'

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/database/prisma'
import { toISODate } from '@/lib/format'
import {
  DEFAULT_QUOTATION_SETTINGS,
  formatSalesPhone,
  readItems,
  readTerms,
  type QuotationFormValues,
  type QuotationSettingsValues,
} from '@/lib/quotation/quotation'

/**
 * A company's quotation settings, with the built-in defaults standing in until
 * an administrator saves their own.
 */
export async function getQuotationSettings(
  companyId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<QuotationSettingsValues> {
  const row = await client.quotationSettings.findUnique({ where: { companyId } })
  if (!row) return DEFAULT_QUOTATION_SETTINGS
  return {
    letterheadName: row.letterheadName,
    address: row.address,
    contactNumber: row.contactNumber,
    footerText: row.footerText,
    defaultScope: row.defaultScope,
    vatNote: row.vatNote,
    defaultTerms: readTerms(row.defaultTerms),
  }
}

export type SalesDetails = Pick<QuotationFormValues, 'salesName' | 'salesPhone' | 'salesEmail'>

/**
 * The sales block of a quotation, taken from the request's sales owner.
 *
 * Never typed on the sheet: it is whoever owns the request, with the number
 * and extension from their user record - blank when they have none.
 */
export async function getSalesDetails(
  salesResponsibleId: string | null,
  settings: QuotationSettingsValues,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<SalesDetails> {
  const owner = salesResponsibleId
    ? await client.user.findUnique({
        where: { id: salesResponsibleId },
        select: { name: true, email: true, phone: true, phoneExt: true },
      })
    : null
  return {
    salesName: owner?.name ?? '',
    // Left empty when the owner has none: the company switchboard is not
    // their contact number, and printing it as one would mislead.
    salesPhone: formatSalesPhone(owner?.phone ?? null, owner?.phoneExt ?? null),
    salesEmail: owner?.email ?? '',
  }
}

/**
 * The location code a request's quotation reference carries: its first
 * location in the administrator's order. A request can span several; the
 * reference names one, and the same one every time.
 */
export async function getReferenceLocation(
  enquiryId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string | null> {
  const first = await client.enquiryLocation.findFirst({
    where: { enquiryId },
    orderBy: [{ value: { sortOrder: 'asc' } }, { value: { label: 'asc' } }],
    select: { value: { select: { label: true } } },
  })
  return first?.value.label ?? null
}

/** The settings as a create payload, for the first write of a company's row. */
export function settingsCreateData(companyId: string, values: QuotationSettingsValues) {
  return {
    companyId,
    letterheadName: values.letterheadName,
    address: values.address,
    contactNumber: values.contactNumber,
    footerText: values.footerText,
    defaultScope: values.defaultScope,
    vatNote: values.vatNote,
    defaultTerms: values.defaultTerms as unknown as Prisma.InputJsonValue,
  }
}

const versionSelect = {
  id: true,
  revision: true,
  quotationDate: true,
  validUntil: true,
  salesName: true,
  salesPhone: true,
  salesEmail: true,
  customerName: true,
  attention: true,
  attentionPhone: true,
  customerAddress: true,
  customerEmail: true,
  customerRef: true,
  enquiryDate: true,
  items: true,
  scopeOfWork: true,
  vatNote: true,
  terms: true,
  currency: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.QuotationVersionSelect

type VersionRow = Prisma.QuotationVersionGetPayload<{ select: typeof versionSelect }>

/** One version, serialisable for the editor. */
export type QuotationVersionView = {
  id: string
  revision: number
  currency: string
  totalAmount: number
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  updatedBy: { id: string; name: string } | null
  values: QuotationFormValues
}

export type QuotationView = {
  id: string
  referenceNo: string
  /** Newest first. */
  versions: QuotationVersionView[]
}

export function serializeVersion(row: VersionRow): QuotationVersionView {
  return {
    id: row.id,
    revision: row.revision,
    currency: row.currency,
    totalAmount: Number(row.totalAmount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    values: {
      quotationDate: toISODate(calendarDate(row.quotationDate)) ?? '',
      validUntil: toISODate(calendarDate(row.validUntil)),
      salesName: row.salesName,
      salesPhone: row.salesPhone,
      salesEmail: row.salesEmail,
      customerName: row.customerName,
      attention: row.attention,
      attentionPhone: row.attentionPhone,
      customerAddress: row.customerAddress,
      customerEmail: row.customerEmail,
      customerRef: row.customerRef,
      enquiryDate: toISODate(calendarDate(row.enquiryDate)),
      items: readItems(row.items),
      scopeOfWork: row.scopeOfWork,
      vatNote: row.vatNote,
      terms: readTerms(row.terms),
    },
  }
}

/**
 * Calendar dates are stored at UTC midnight; read them back on the same
 * calendar day whatever the server's timezone is.
 */
function calendarDate(value: Date | null): Date | null {
  if (!value) return null
  return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

export async function getQuotationForEnquiry(
  companyId: string,
  enquiryId: string,
): Promise<QuotationView | null> {
  const row = await prisma.quotation.findFirst({
    // Scoped by company as well as by request: an id from another company must
    // read as "no quotation", never as someone else's document.
    where: { enquiryId, companyId },
    relationLoadStrategy: 'join',
    select: {
      id: true,
      referenceNo: true,
      versions: { select: versionSelect, orderBy: { revision: 'desc' } },
    },
  })
  if (!row) return null
  return {
    id: row.id,
    referenceNo: row.referenceNo,
    versions: row.versions.map(serializeVersion),
  }
}

/** One version with what the PDF needs around it, scoped to the company. */
export async function getVersionForDocument(companyId: string, versionId: string) {
  const row = await prisma.quotationVersion.findFirst({
    where: { id: versionId, quotation: { companyId } },
    relationLoadStrategy: 'join',
    select: {
      ...versionSelect,
      quotation: {
        select: {
          id: true,
          referenceNo: true,
          enquiry: { select: { id: true, jobNo: true, isDeleted: true } },
        },
      },
    },
  })
  if (!row) return null
  return {
    version: serializeVersion(row),
    referenceNo: row.quotation.referenceNo,
    quotationId: row.quotation.id,
    enquiry: row.quotation.enquiry,
  }
}
