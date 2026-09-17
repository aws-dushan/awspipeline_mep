import type { DropdownTypeKey } from '@prisma/client'

/**
 * Single source of truth for the 17 pipeline columns.
 *
 * The data grid, every column filter and the Excel exporter all read this
 * list, so the business columns can never drift out of order or out of sync
 * between the screen and the export.
 */

export type ColumnFilterKind =
  | 'number-range'
  | 'text'
  | 'date-range'
  | 'user-multi'
  | 'dropdown-multi'
  | 'currency-range'

export type PipelineColumnKey =
  | 'serialNo'
  | 'jobNo'
  | 'enquiryDate'
  | 'salesResponsible'
  | 'customerName'
  | 'projectName'
  | 'status'
  | 'location'
  | 'material'
  | 'enquiryDetails'
  | 'quoteValue'
  | 'probability'
  | 'expectedOrderDate'
  | 'expectedBillingDate'
  | 'email'
  | 'phoneNumber'
  | 'remarks'

export type PipelineColumn = {
  key: PipelineColumnKey
  /** Header label. Matches the original spreadsheet wording exactly. */
  label: string
  /** Header label used in the exported workbook. */
  exportLabel: string
  filter: ColumnFilterKind
  /** Dropdown catalogue this column draws from, when applicable. */
  dropdownType?: DropdownTypeKey
  /** Default pixel width in the grid. */
  width: number
  minWidth: number
  /** Excel column width in characters. */
  excelWidth: number
  align?: 'left' | 'right' | 'center'
  /** Pinned to the left edge of the grid so identity stays visible. */
  pinned?: boolean
  /** Long free text - rendered truncated with a tooltip. */
  truncate?: boolean
}

export const PIPELINE_COLUMNS: readonly PipelineColumn[] = [
  {
    key: 'serialNo',
    label: 'S.No',
    exportLabel: 'S.No',
    filter: 'number-range',
    width: 76,
    minWidth: 64,
    excelWidth: 8,
    align: 'right',
    pinned: true,
  },
  {
    key: 'jobNo',
    label: 'JOB NO',
    exportLabel: 'JOB NO',
    filter: 'text',
    width: 104,
    minWidth: 88,
    excelWidth: 12,
    pinned: true,
  },
  {
    key: 'enquiryDate',
    label: 'Enquiry Date',
    exportLabel: 'Enquiry Date',
    filter: 'date-range',
    width: 128,
    minWidth: 112,
    excelWidth: 14,
  },
  {
    key: 'salesResponsible',
    label: 'Sales Responsible',
    exportLabel: 'Sales Responsible',
    filter: 'user-multi',
    width: 168,
    minWidth: 140,
    excelWidth: 20,
  },
  {
    key: 'customerName',
    label: 'Customer Name',
    exportLabel: 'Customer Name',
    filter: 'text',
    width: 232,
    minWidth: 160,
    excelWidth: 32,
    truncate: true,
  },
  {
    key: 'projectName',
    label: 'Project Name',
    exportLabel: 'Project Name',
    filter: 'text',
    width: 216,
    minWidth: 160,
    excelWidth: 30,
    truncate: true,
  },
  {
    key: 'status',
    label: 'Status',
    exportLabel: 'Status',
    filter: 'dropdown-multi',
    dropdownType: 'STATUS',
    width: 144,
    minWidth: 120,
    excelWidth: 16,
  },
  {
    key: 'location',
    label: 'Location',
    exportLabel: 'Location',
    filter: 'dropdown-multi',
    dropdownType: 'LOCATION',
    width: 124,
    minWidth: 104,
    excelWidth: 14,
  },
  {
    key: 'material',
    label: 'Material',
    exportLabel: 'Material',
    filter: 'dropdown-multi',
    dropdownType: 'MATERIAL',
    width: 140,
    minWidth: 112,
    excelWidth: 16,
  },
  {
    key: 'enquiryDetails',
    label: 'Enquiry Details',
    exportLabel: 'Enquiry Details',
    filter: 'text',
    width: 240,
    minWidth: 160,
    excelWidth: 36,
    truncate: true,
  },
  {
    key: 'quoteValue',
    label: 'Quote Value',
    exportLabel: 'Quote Value',
    filter: 'currency-range',
    width: 148,
    minWidth: 120,
    excelWidth: 16,
    align: 'right',
  },
  {
    key: 'probability',
    label: 'Probability',
    exportLabel: 'Probability',
    filter: 'dropdown-multi',
    dropdownType: 'PROBABILITY',
    width: 128,
    minWidth: 104,
    excelWidth: 13,
    align: 'center',
  },
  {
    key: 'expectedOrderDate',
    label: 'Exp Order Date',
    exportLabel: 'Exp Order Date',
    filter: 'date-range',
    width: 140,
    minWidth: 120,
    excelWidth: 15,
  },
  {
    key: 'expectedBillingDate',
    label: 'Exp Billing Date',
    exportLabel: 'Exp Billing Date',
    filter: 'date-range',
    width: 144,
    minWidth: 120,
    excelWidth: 15,
  },
  {
    key: 'email',
    label: 'Email',
    exportLabel: 'Email',
    filter: 'text',
    width: 216,
    minWidth: 160,
    excelWidth: 30,
    truncate: true,
  },
  {
    key: 'phoneNumber',
    label: 'Phone Number',
    exportLabel: 'Phone Number',
    filter: 'text',
    width: 168,
    minWidth: 140,
    excelWidth: 20,
  },
  {
    key: 'remarks',
    label: 'Remarks',
    exportLabel: 'Remarks',
    filter: 'text',
    width: 280,
    minWidth: 180,
    excelWidth: 44,
    truncate: true,
  },
] as const

export const PIPELINE_COLUMN_MAP = new Map<PipelineColumnKey, PipelineColumn>(
  PIPELINE_COLUMNS.map((column) => [column.key, column]),
)

export function columnLabel(key: PipelineColumnKey): string {
  return PIPELINE_COLUMN_MAP.get(key)?.label ?? key
}

/** Columns backed by an admin-configured dropdown catalogue. */
export const DROPDOWN_COLUMNS = PIPELINE_COLUMNS.filter(
  (column): column is PipelineColumn & { dropdownType: DropdownTypeKey } =>
    Boolean(column.dropdownType),
)

/** Left-pinned identity columns, in order. */
export const PINNED_COLUMN_KEYS = PIPELINE_COLUMNS.filter((c) => c.pinned).map((c) => c.key)
