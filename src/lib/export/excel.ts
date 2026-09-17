import 'server-only'

import ExcelJS from 'exceljs'
import { format } from 'date-fns'

import { streamFilteredEnquiries, type PipelineRow, type QueryOptions } from '@/lib/database/enquiry-repository'
import { hasActiveFilters } from '@/lib/filters/enquiry-filters'
import { PIPELINE_COLUMNS } from '@/lib/pipeline/columns'
import { toDate } from '@/lib/format'

/**
 * Excel export.
 *
 * Runs against `streamFilteredEnquiries`, which is the same query the grid
 * uses - so the workbook always contains exactly the filtered, non-deleted
 * rows of the selected company, never merely the page that happens to be
 * loaded in the browser.
 */

const HEADER_FILL = 'FF12203F'
const HEADER_FONT = 'FFFFFFFF'
const BORDER_COLOR = 'FFE2E8F0'
const ZEBRA_FILL = 'FFF8FAFC'

export type ExportContext = QueryOptions & {
  company: { name: string; currency: string }
  exportedBy: { name: string; email: string }
}

export type ExportResult = {
  buffer: Buffer
  filename: string
  rowCount: number
}

export function buildExportFilename(companyName: string, filtered: boolean): string {
  const safeCompany = companyName
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 40)
    .trim()
  const stamp = format(new Date(), 'yyyy-MM-dd')
  return `${safeCompany || 'Company'}_Pipeline${filtered ? '_Filtered' : ''}_${stamp}.xlsx`
}

export async function generatePipelineWorkbook(context: ExportContext): Promise<ExportResult> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = context.exportedBy.name
  workbook.company = context.company.name
  workbook.created = new Date()
  workbook.lastModifiedBy = context.exportedBy.name

  const sheet = workbook.addWorksheet('Pipeline', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  sheet.columns = PIPELINE_COLUMNS.map((column) => ({
    header: column.exportLabel,
    key: column.key,
    width: column.excelWidth,
  }))

  // --- Header row ---
  const headerRow = sheet.getRow(1)
  headerRow.height = 26
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false }
    cell.border = {
      bottom: { style: 'thin', color: { argb: HEADER_FILL } },
    }
  })

  const currency = context.company.currency || 'AED'
  const currencyFormat = `"${currency}" #,##0.00`
  const dateFormat = 'dd mmm yyyy'

  let rowCount = 0

  for await (const batch of streamFilteredEnquiries(context)) {
    for (const enquiry of batch) {
      const row = sheet.addRow(toExcelRow(enquiry))
      rowCount += 1
      styleDataRow(row, rowCount, { currencyFormat, dateFormat })
    }
  }

  // --- Excel autofilter across the full used range ---
  const lastRow = Math.max(1, rowCount + 1)
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: PIPELINE_COLUMNS.length },
  }

  applyColumnAlignment(sheet)
  addSummarySheet(workbook, context, rowCount)

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    filename: buildExportFilename(context.company.name, hasActiveFilters(context.filters)),
    rowCount,
  }
}

type ExcelRowValues = {
  serialNo: number
  jobNo: string
  enquiryDate: Date | null
  salesResponsible: string
  customerName: string
  projectName: string
  status: string
  location: string
  material: string
  enquiryDetails: string
  quoteValue: number | null
  probability: number | string | null
  expectedOrderDate: Date | null
  expectedBillingDate: Date | null
  email: string
  phoneNumber: string
  remarks: string
}

/**
 * Calendar dates are stored at UTC midnight. Excel has no timezone concept, so
 * they are shifted back into a local-midnight Date - otherwise a workbook
 * opened west of UTC shows every date one day early.
 */
function toExcelDate(iso: string | null): Date | null {
  const date = toDate(iso)
  if (!date) return null
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function toExcelRow(enquiry: PipelineRow): ExcelRowValues {
  return {
    serialNo: enquiry.serialNo,
    jobNo: enquiry.jobNo,
    enquiryDate: toExcelDate(enquiry.enquiryDate),
    salesResponsible: enquiry.salesResponsible?.name ?? '',
    customerName: enquiry.customerName,
    projectName: enquiry.projectName ?? '',
    status: enquiry.status?.label ?? '',
    location: enquiry.location?.label ?? '',
    material: enquiry.material?.label ?? '',
    enquiryDetails: enquiry.enquiryDetails ?? '',
    quoteValue: enquiry.quoteValue,
    // A probability with a numeric weight exports as a real percentage cell so
    // it can be averaged in Excel; a purely descriptive one exports as text.
    probability:
      enquiry.probability?.numericValue !== null && enquiry.probability?.numericValue !== undefined
        ? enquiry.probability.numericValue / 100
        : enquiry.probability?.label ?? '',
    expectedOrderDate: toExcelDate(enquiry.expectedOrderDate),
    expectedBillingDate: toExcelDate(enquiry.expectedBillingDate),
    email: enquiry.email ?? '',
    phoneNumber: enquiry.phoneNumber ?? '',
    remarks: enquiry.remarks ?? '',
  }
}

function styleDataRow(
  row: ExcelJS.Row,
  index: number,
  formats: { currencyFormat: string; dateFormat: string },
) {
  const zebra = index % 2 === 0

  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { size: 10.5, color: { argb: 'FF1E293B' } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = {
      bottom: { style: 'hair', color: { argb: BORDER_COLOR } },
    }
    if (zebra) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } }
    }
  })

  row.getCell('enquiryDate').numFmt = formats.dateFormat
  row.getCell('expectedOrderDate').numFmt = formats.dateFormat
  row.getCell('expectedBillingDate').numFmt = formats.dateFormat

  const quote = row.getCell('quoteValue')
  quote.numFmt = formats.currencyFormat
  quote.alignment = { vertical: 'middle', horizontal: 'right' }

  const probability = row.getCell('probability')
  if (typeof probability.value === 'number') {
    probability.numFmt = '0%'
  }
  probability.alignment = { vertical: 'middle', horizontal: 'center' }

  row.getCell('serialNo').alignment = { vertical: 'middle', horizontal: 'right' }
}

function applyColumnAlignment(sheet: ExcelJS.Worksheet) {
  for (const column of PIPELINE_COLUMNS) {
    if (!column.align || column.align === 'left') continue
    const sheetColumn = sheet.getColumn(column.key)
    sheetColumn.alignment = { vertical: 'middle', horizontal: column.align }
  }
}

/** A short provenance sheet: who exported what, when, and under which filters. */
function addSummarySheet(
  workbook: ExcelJS.Workbook,
  context: ExportContext,
  rowCount: number,
) {
  const sheet = workbook.addWorksheet('Export Details')
  sheet.columns = [
    { key: 'label', width: 24 },
    { key: 'value', width: 60 },
  ]

  const rows: [string, string][] = [
    ['Company', context.company.name],
    ['Exported by', `${context.exportedBy.name} (${context.exportedBy.email})`],
    ['Exported at', format(new Date(), 'dd MMM yyyy, HH:mm')],
    ['Rows exported', String(rowCount)],
    ['Filters applied', hasActiveFilters(context.filters) ? 'Yes' : 'No (full pipeline)'],
    ['Deleted records', 'Excluded'],
  ]

  for (const [label, value] of rows) {
    const row = sheet.addRow({ label, value })
    row.getCell('label').font = { bold: true, size: 10.5, color: { argb: 'FF475569' } }
    row.getCell('value').font = { size: 10.5, color: { argb: 'FF0F172A' } }
  }

  const activeFilters = describeFilters(context)
  if (activeFilters.length > 0) {
    sheet.addRow({})
    const heading = sheet.addRow({ label: 'Active filters', value: '' })
    heading.getCell('label').font = { bold: true, size: 11, color: { argb: 'FF12203F' } }
    for (const [label, value] of activeFilters) {
      const row = sheet.addRow({ label, value })
      row.getCell('label').font = { size: 10.5, color: { argb: 'FF475569' } }
      row.getCell('value').font = { size: 10.5, color: { argb: 'FF0F172A' } }
    }
  }
}

/** Renders the active filter set for the provenance sheet. */
function describeFilters(context: ExportContext): [string, string][] {
  const { filters } = context
  const described: [string, string][] = []
  const range = (label: string, from?: unknown, to?: unknown) => {
    if (!from && !to) return
    described.push([label, `${from ?? 'any'} to ${to ?? 'any'}`])
  }

  if (filters.q) described.push(['Search', filters.q])
  if (filters.serialNo) described.push(['S.No', filters.serialNo])
  range('S.No range', filters.serialNoMin, filters.serialNoMax)
  if (filters.jobNo) described.push(['Job No', filters.jobNo])
  range('Enquiry Date', filters.enquiryDateFrom, filters.enquiryDateTo)
  if (filters.customerName) described.push(['Customer Name', filters.customerName])
  if (filters.projectName) described.push(['Project Name', filters.projectName])
  if (filters.enquiryDetails) described.push(['Enquiry Details', filters.enquiryDetails])
  range('Quote Value', filters.quoteValueMin, filters.quoteValueMax)
  range('Exp Order Date', filters.expectedOrderDateFrom, filters.expectedOrderDateTo)
  range('Exp Billing Date', filters.expectedBillingDateFrom, filters.expectedBillingDateTo)
  if (filters.email) described.push(['Email', filters.email])
  if (filters.phoneNumber) described.push(['Phone Number', filters.phoneNumber])
  if (filters.remarks) described.push(['Remarks', filters.remarks])

  // Id-valued filters are resolved to labels by the caller and passed through
  // metadata; unresolved ids would be meaningless in a workbook.
  const labelled = context.filters as unknown as { __labels?: Record<string, string[]> }
  for (const [label, values] of Object.entries(labelled.__labels ?? {})) {
    if (values.length > 0) described.push([label, values.join(', ')])
  }

  return described
}
