import 'server-only'

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/database/prisma'
import {
  buildEnquiryOrderBy,
  buildEnquiryWhere,
  type EnquiryFilters,
} from '@/lib/filters/enquiry-filters'

/**
 * Shared read model for pipeline rows.
 *
 * The grid, the summary strip and the Excel export all go through here, so a
 * filter can never mean one thing on screen and another in the export.
 */

const enquirySelect = {
  id: true,
  serialNo: true,
  jobNo: true,
  enquiryDate: true,
  customerName: true,
  projectName: true,
  enquiryDetails: true,
  quoteValue: true,
  expectedOrderDate: true,
  expectedBillingDate: true,
  email: true,
  phoneNumber: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
  deletedAt: true,
  deleteReason: true,
  createdById: true,
  salesResponsibleId: true,
  statusValueId: true,
  locationValueId: true,
  materialValueId: true,
  probabilityValueId: true,
  salesResponsible: { select: { id: true, name: true, displayCode: true, avatarColor: true } },
  status: { select: { id: true, label: true, color: true, isActive: true } },
  location: { select: { id: true, label: true, color: true, isActive: true } },
  material: { select: { id: true, label: true, color: true, isActive: true } },
  probability: {
    select: { id: true, label: true, color: true, isActive: true, numericValue: true },
  },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  deletedBy: { select: { id: true, name: true } },
  deleteRequests: {
    where: { status: 'PENDING' as const },
    select: {
      id: true,
      reason: true,
      requestedAt: true,
      requestedBy: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
    },
    take: 1,
  },
} satisfies Prisma.EnquirySelect

type EnquiryRow = Prisma.EnquiryGetPayload<{ select: typeof enquirySelect }>

/** Plain, serialisable shape handed to client components. */
export type PipelineRow = {
  id: string
  serialNo: number
  jobNo: string
  enquiryDate: string
  salesResponsible: { id: string; name: string; displayCode: string | null; avatarColor: string } | null
  customerName: string
  projectName: string | null
  status: BadgeValue | null
  location: BadgeValue | null
  material: BadgeValue | null
  enquiryDetails: string | null
  quoteValue: number | null
  probability: (BadgeValue & { numericValue: number | null }) | null
  expectedOrderDate: string | null
  expectedBillingDate: string | null
  email: string | null
  phoneNumber: string | null
  remarks: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  updatedBy: { id: string; name: string } | null
  createdById: string | null
  salesResponsibleId: string | null
  isDeleted: boolean
  deletedAt: string | null
  deleteReason: string | null
  deletedBy: { id: string; name: string } | null
  pendingDeleteRequest: {
    id: string
    reason: string
    requestedAt: string
    requestedBy: { id: string; name: string }
    supervisor: { id: string; name: string } | null
  } | null
}

export type BadgeValue = {
  id: string
  label: string
  color: string | null
  isActive: boolean
}

function serializeRow(row: EnquiryRow): PipelineRow {
  const pending = row.deleteRequests[0] ?? null
  return {
    id: row.id,
    serialNo: row.serialNo,
    jobNo: row.jobNo,
    enquiryDate: row.enquiryDate.toISOString(),
    salesResponsible: row.salesResponsible,
    customerName: row.customerName,
    projectName: row.projectName,
    status: row.status,
    location: row.location,
    material: row.material,
    enquiryDetails: row.enquiryDetails,
    quoteValue: row.quoteValue === null ? null : Number(row.quoteValue),
    probability: row.probability
      ? {
          ...row.probability,
          numericValue:
            row.probability.numericValue === null ? null : Number(row.probability.numericValue),
        }
      : null,
    expectedOrderDate: row.expectedOrderDate?.toISOString() ?? null,
    expectedBillingDate: row.expectedBillingDate?.toISOString() ?? null,
    email: row.email,
    phoneNumber: row.phoneNumber,
    remarks: row.remarks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdById: row.createdById,
    salesResponsibleId: row.salesResponsibleId,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    deleteReason: row.deleteReason,
    deletedBy: row.deletedBy,
    pendingDeleteRequest: pending
      ? {
          id: pending.id,
          reason: pending.reason,
          requestedAt: pending.requestedAt.toISOString(),
          requestedBy: pending.requestedBy,
          supervisor: pending.supervisor,
        }
      : null,
  }
}

export type PipelinePage = {
  rows: PipelineRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  /** Aggregate over the whole filtered set, not just the current page. */
  summary: {
    totalQuoteValue: number
  }
}

export type QueryOptions = {
  companyId: string
  filters: EnquiryFilters
  includeDeleted?: boolean
  deletedOnly?: boolean
}

export async function queryPipelinePage(options: QueryOptions): Promise<PipelinePage> {
  const where = buildEnquiryWhere(options)
  const orderBy = buildEnquiryOrderBy(options.filters)
  const page = options.filters.page ?? 1
  const pageSize = options.filters.pageSize ?? 50

  // Both queries go out together. The database is remote (~34ms RTT), so
  // every avoided sequential round trip is worth real wall clock.
  const [rows, aggregate] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: enquirySelect,
      // One LATERAL JOIN rather than a round trip per relation.
      relationLoadStrategy: 'join',
    }),
    // `_count: { _all }` gives the row total in the same trip as the sum,
    // instead of a separate count query.
    prisma.enquiry.aggregate({
      where,
      _sum: { quoteValue: true },
      _count: { _all: true },
    }),
  ])

  const total = aggregate._count._all

  return {
    rows: rows.map(serializeRow),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalQuoteValue: Number(aggregate._sum.quoteValue ?? 0),
    },
  }
}

/**
 * Stream every row matching the filters, for the Excel export.
 *
 * Deliberately keyset-paginated rather than one giant `findMany`: an export of
 * tens of thousands of rows must not hold the entire result set in memory at
 * once, nor block the connection pool.
 */
export async function* streamFilteredEnquiries(
  options: QueryOptions,
  batchSize = 500,
): AsyncGenerator<PipelineRow[]> {
  const where = buildEnquiryWhere(options)
  const orderBy = buildEnquiryOrderBy(options.filters)
  let cursor: string | undefined

  for (;;) {
    const batch = await prisma.enquiry.findMany({
      where,
      orderBy,
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: enquirySelect,
      relationLoadStrategy: 'join',
    })
    if (batch.length === 0) return
    yield batch.map(serializeRow)
    if (batch.length < batchSize) return
    cursor = batch[batch.length - 1].id
  }
}

export async function countFilteredEnquiries(options: QueryOptions): Promise<number> {
  return prisma.enquiry.count({ where: buildEnquiryWhere(options) })
}

export async function getEnquiryById(
  companyId: string,
  enquiryId: string,
): Promise<PipelineRow | null> {
  const row = await prisma.enquiry.findFirst({
    // companyId in the predicate, not just the id: a valid id from another
    // company must read as "not found".
    where: { id: enquiryId, companyId },
    select: enquirySelect,
  })
  return row ? serializeRow(row) : null
}

/** Distinct customer names for the customer filter's suggestion list. */
export async function getCustomerSuggestions(companyId: string, limit = 300): Promise<string[]> {
  const rows = await prisma.enquiry.findMany({
    where: { companyId, isDeleted: false },
    distinct: ['customerName'],
    orderBy: { customerName: 'asc' },
    take: limit,
    select: { customerName: true },
  })
  return rows.map((row) => row.customerName)
}
