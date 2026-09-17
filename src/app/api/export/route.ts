import { NextResponse, type NextRequest } from 'next/server'

import { writeAudit } from '@/lib/audit'
import {
  AuthenticationError,
  AuthorizationError,
  requireCompanyPermission,
} from '@/lib/auth/session'
import { prisma } from '@/lib/database/prisma'
import { generatePipelineWorkbook } from '@/lib/export/excel'
import { countActiveFilters, parseEnquiryFilters } from '@/lib/filters/enquiry-filters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Large exports stream row batches; give them room. */
export const maxDuration = 120

/**
 * Excel export.
 *
 * Runs the *same* filter query as the grid against the database, so the
 * workbook contains every matching row for the selected company - not the page
 * currently loaded in the browser - and never includes soft-deleted records.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const companyId = searchParams.get('companyId')

  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  try {
    const { user, company } = await requireCompanyPermission(companyId, 'pipeline:export')
    const filters = parseEnquiryFilters(searchParams)

    // Pagination is meaningless for an export - take everything that matches.
    const exportFilters = { ...filters, page: 1, pageSize: 200 }

    const companyRecord = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { name: true, currency: true },
    })

    const labels = await resolveFilterLabels(company.id, filters)

    const { buffer, filename, rowCount } = await generatePipelineWorkbook({
      companyId: company.id,
      filters: Object.assign(exportFilters, { __labels: labels }),
      company: companyRecord,
      exportedBy: { name: user.name, email: user.email },
    })

    await writeAudit({
      actorId: user.id,
      companyId: company.id,
      action: 'DATA_EXPORTED',
      entity: 'ENQUIRY',
      entityId: company.id,
      summary: `${user.name} exported ${rowCount} pipeline ${rowCount === 1 ? 'row' : 'rows'}`,
      metadata: {
        rowCount,
        filename,
        activeFilters: countActiveFilters(filters),
        filters: labels,
      },
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
        'X-Row-Count': String(rowCount),
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[api:export]', error)
    return NextResponse.json({ error: 'Unable to build the export.' }, { status: 500 })
  }
}

/**
 * Turn id-valued filters into labels for the workbook's provenance sheet.
 * A column of cuids would tell the reader nothing about what was filtered.
 */
async function resolveFilterLabels(
  companyId: string,
  filters: ReturnType<typeof parseEnquiryFilters>,
): Promise<Record<string, string[]>> {
  const labels: Record<string, string[]> = {}

  const valueIds = [
    ...(filters.status ?? []),
    ...(filters.location ?? []),
    ...(filters.material ?? []),
    ...(filters.probability ?? []),
  ]

  if (valueIds.length > 0) {
    const values = await prisma.dropdownValue.findMany({
      where: { id: { in: valueIds }, companyId },
      select: { id: true, typeKey: true, label: true },
    })
    const pick = (ids: string[] | undefined) =>
      (ids ?? [])
        .map((id) => values.find((value) => value.id === id)?.label)
        .filter((label): label is string => Boolean(label))

    if (filters.status?.length) labels.Status = pick(filters.status)
    if (filters.location?.length) labels.Location = pick(filters.location)
    if (filters.material?.length) labels.Material = pick(filters.material)
    if (filters.probability?.length) labels.Probability = pick(filters.probability)
  }

  if (filters.salesResponsible?.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: filters.salesResponsible } },
      select: { name: true },
    })
    labels['Sales Responsible'] = users.map((user) => user.name)
  }

  return labels
}
