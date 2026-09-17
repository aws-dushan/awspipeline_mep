'use client'

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Clock3,
  FileSpreadsheet,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'

import { ColumnFilter, type FilterOptions } from '@/components/pipeline/filters/column-filter'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProbabilityBadge, ValueBadge } from '@/components/ui/badge'
import { Avatar, Skeleton, Tooltip } from '@/components/ui/primitives'
import type { PipelineRow } from '@/lib/database/enquiry-repository'
import { formatCalendarDate, formatCurrency, formatRelative } from '@/lib/format'
import {
  SORTABLE_KEYS,
  type EnquiryFilters,
  type SortableKey,
} from '@/lib/filters/enquiry-filters'
import { PIPELINE_COLUMNS, type PipelineColumnKey } from '@/lib/pipeline/columns'
import { cn } from '@/lib/utils'

const SORTABLE = new Set<string>(SORTABLE_KEYS)

/** Width of the pinned row-actions column, in pixels. */
const ACTIONS_WIDTH = 52

/**
 * Total grid width, and the reason the table uses `table-layout: fixed`.
 *
 * In the default auto layout a browser ignores `max-width` on a cell and
 * widens columns to fit their content. Sticky offsets are computed from the
 * declared widths, so a column that renders wider than declared pushes the
 * next pinned column on top of it - which is what hid S.No behind Job No.
 * Fixed layout makes the declared width the actual width, so the offsets are
 * always right and the truncation is predictable.
 */
const TOTAL_WIDTH =
  ACTIONS_WIDTH + PIPELINE_COLUMNS.reduce((sum, column) => sum + column.width, 0)

/**
 * Lock a column to an exact width.
 *
 * Sticky offsets are computed from declared widths, so a pinned cell that
 * renders wider than declared slides under its neighbour. Pinning min and max
 * to the same value removes that possibility.
 */
function lockedWidth(width: number, left?: number): React.CSSProperties {
  return {
    width,
    minWidth: width,
    maxWidth: width,
    ...(left !== undefined ? { left } : {}),
  }
}

/** Column key -> the sort key the backend understands. */
const SORT_KEY_BY_COLUMN: Partial<Record<PipelineColumnKey, SortableKey>> = {
  serialNo: 'serialNo',
  jobNo: 'jobNo',
  enquiryDate: 'enquiryDate',
  customerName: 'customerName',
  projectName: 'projectName',
  quoteValue: 'quoteValue',
  expectedOrderDate: 'expectedOrderDate',
  expectedBillingDate: 'expectedBillingDate',
}

export type PipelineGridProps = {
  rows: PipelineRow[]
  loading: boolean
  currency: string
  filters: EnquiryFilters
  activeColumns: Set<PipelineColumnKey>
  filterOptions: FilterOptions
  /** Ids to flash - newly created locally, or changed by another user. */
  highlightedIds: Set<string>
  canEdit: (row: PipelineRow) => boolean
  canRequestDelete: boolean
  onEdit: (row: PipelineRow) => void
  onRequestDelete: (row: PipelineRow) => void
  onFilterChange: (patch: Partial<EnquiryFilters>) => void
  onClearColumn: (column: PipelineColumnKey) => void
  onSort: (key: SortableKey) => void
  emptyState: React.ReactNode
}

export function PipelineGrid({
  rows,
  loading,
  currency,
  filters,
  activeColumns,
  filterOptions,
  highlightedIds,
  canEdit,
  canRequestDelete,
  onEdit,
  onRequestDelete,
  onFilterChange,
  onClearColumn,
  onSort,
  emptyState,
}: PipelineGridProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const columns = React.useMemo<ColumnDef<PipelineRow>[]>(
    () =>
      PIPELINE_COLUMNS.map((column) => ({
        id: column.key,
        size: column.width,
        minSize: column.minWidth,
        header: () => column.label,
        cell: ({ row }) => renderCell(column.key, row.original, currency),
      })),
    [currency],
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { minSize: 64 },
  })

  /**
   * Left-pinned columns: row actions first, then S.No and Job No. Keeping
   * those three fixed is what makes 17 columns navigable - you always know
   * which row you are reading, and can act on it without scrolling back.
   *
   * Offsets are cumulative declared widths, so every pinned cell has to be
   * exactly as wide as it claims. A cell allowed to grow past its declared
   * width ends up underneath the next pinned cell, which is what previously
   * hid S.No behind Job No once the grid was scrolled.
   */
  const pinnedOffsets = React.useMemo(() => {
    const offsets = new Map<PipelineColumnKey, number>()
    let running = ACTIONS_WIDTH
    for (const column of PIPELINE_COLUMNS) {
      if (!column.pinned) break
      offsets.set(column.key, running)
      running += column.width
    }
    return { offsets, total: running }
  }, [])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-100 bg-white shadow-sm">
      <div className="scroll-polished min-h-0 flex-1 overflow-auto overscroll-x-contain">
        <table
          style={{ width: TOTAL_WIDTH, tableLayout: 'fixed' }}
          className="border-separate border-spacing-0 text-left"
        >
          <thead className="sticky top-0 z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                <th
                  scope="col"
                  style={lockedWidth(ACTIONS_WIDTH, 0)}
                  className="sticky left-0 z-10 h-10 border-b border-ink-100 bg-ink-50/80 px-2 backdrop-blur"
                >
                  <span className="sr-only">Actions</span>
                </th>

                {headerGroup.headers.map((header) => {
                  const column = PIPELINE_COLUMNS.find((c) => c.key === header.id)!
                  const sortKey = SORT_KEY_BY_COLUMN[column.key]
                  const sortable = sortKey && SORTABLE.has(sortKey)
                  const isSorted = filters.sortBy === sortKey
                  const pinnedLeft = pinnedOffsets.offsets.get(column.key)

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={{
                        width: column.width,
                        minWidth: column.minWidth,
                        ...(pinnedLeft !== undefined ? { left: pinnedLeft } : {}),
                      }}
                      className={cn(
                        'group/header h-10 border-b border-ink-100 bg-ink-50/80 px-3 backdrop-blur',
                        'text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-500',
                        'select-none',
                        pinnedLeft !== undefined &&
                          'sticky z-10 shadow-[1px_0_0_0_var(--color-ink-100)]',
                        column.align === 'right' && 'text-right',
                        column.align === 'center' && 'text-center',
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-1',
                          column.align === 'right' && 'justify-end',
                          column.align === 'center' && 'justify-center',
                        )}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => onSort(sortKey)}
                            className={cn(
                              'flex min-w-0 items-center gap-1 rounded transition-colors hover:text-ink-900',
                              isSorted && 'text-brand-700',
                            )}
                          >
                            <span className="truncate">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {isSorted ? (
                              filters.sortDir === 'asc' ? (
                                <ArrowUp className="size-3 shrink-0" />
                              ) : (
                                <ArrowDown className="size-3 shrink-0" />
                              )
                            ) : (
                              <ChevronsUpDown className="size-3 shrink-0 opacity-0 transition-opacity group-hover/header:opacity-40" />
                            )}
                          </button>
                        ) : (
                          <span className="truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}

                        <ColumnFilter
                          column={column}
                          filters={filters}
                          options={filterOptions}
                          active={activeColumns.has(column.key)}
                          onChange={onFilterChange}
                          onClear={() => onClearColumn(column.key)}
                        />
                      </div>
                    </th>
                  )
                })}

              </tr>
            ))}
          </thead>

          <tbody>
            {loading && rows.length === 0 ? (
              <SkeletonRows pinnedOffsets={pinnedOffsets.offsets} />
            ) : null}

            {table.getRowModel().rows.map((row, index) => {
              const record = row.original
              const selected = selectedId === record.id
              const pendingDelete = Boolean(record.pendingDeleteRequest)

              return (
                <tr
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  onDoubleClick={() => canEdit(record) && onEdit(record)}
                  className={cn(
                    'group/row cursor-default transition-colors duration-100',
                    index % 2 === 1 && 'bg-ink-50/35',
                    'hover:bg-brand-50/45',
                    selected && 'bg-brand-50/70 hover:bg-brand-50/70',
                    highlightedIds.has(record.id) && 'row-flash',
                    pendingDelete && 'opacity-[0.94]',
                  )}
                >
                  <td
                    style={lockedWidth(ACTIONS_WIDTH, 0)}
                    className={cn(
                      'sticky left-0 z-[5] h-[46px] border-b border-ink-100/70 px-1 text-center',
                      selected
                        ? 'bg-[#eef3fb]'
                        : index % 2 === 1
                          ? 'bg-[#fafbfd]'
                          : 'bg-white',
                      'group-hover/row:bg-[#eff4fd]',
                    )}
                  >
                    <RowActions
                      row={record}
                      canEdit={canEdit(record)}
                      canRequestDelete={canRequestDelete}
                      onEdit={() => onEdit(record)}
                      onRequestDelete={() => onRequestDelete(record)}
                    />
                  </td>

                  {row.getVisibleCells().map((cell) => {
                    const column = PIPELINE_COLUMNS.find((c) => c.key === cell.column.id)!
                    const pinnedLeft = pinnedOffsets.offsets.get(column.key)

                    return (
                      <td
                        key={cell.id}
                        style={{
                          width: column.width,
                          minWidth: column.minWidth,
                          ...(pinnedLeft !== undefined ? { left: pinnedLeft } : {}),
                        }}
                        className={cn(
                          'h-[46px] border-b border-ink-100/70 px-3 text-[13px] text-ink-700',
                          pinnedLeft !== undefined && [
                            'sticky z-[5] shadow-[1px_0_0_0_var(--color-ink-100)]',
                            // The pinned cells need their own opaque background
                            // or the scrolling columns show through them.
                            selected
                              ? 'bg-[#eef3fb]'
                              : index % 2 === 1
                                ? 'bg-[#fafbfd]'
                                : 'bg-white',
                            'group-hover/row:bg-[#eff4fd]',
                          ],
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}

                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && rows.length === 0 ? (
          <div className="sticky left-0 w-full">{emptyState}</div>
        ) : null}
      </div>

      {/* A soft refresh veil: keeps the current data readable while the next
          page loads, instead of blanking the grid. */}
      <AnimatePresence>
        {loading && rows.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 top-10 h-0.5 overflow-hidden"
          >
            <motion.span
              className="block h-full w-1/3 bg-brand-500"
              animate={{ x: ['-100%', '400%'] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cells                                                                     */
/* -------------------------------------------------------------------------- */

function renderCell(key: PipelineColumnKey, row: PipelineRow, currency: string): React.ReactNode {
  switch (key) {
    case 'serialNo':
      return <span className="tabular text-[12.5px] font-medium text-ink-400">{row.serialNo}</span>

    case 'jobNo':
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular font-semibold text-ink-900">{row.jobNo}</span>
          {row.pendingDeleteRequest ? (
            <Tooltip
              content={`Deletion requested by ${row.pendingDeleteRequest.requestedBy.name}`}
            >
              <span className="grid size-4 place-items-center rounded-full bg-warning-soft text-warning">
                <Clock3 className="size-2.5" />
              </span>
            </Tooltip>
          ) : null}
        </span>
      )

    case 'enquiryDate':
      return <span className="tabular whitespace-nowrap">{formatCalendarDate(row.enquiryDate)}</span>

    case 'salesResponsible':
      // The person's name, not their display code - a code like "ADMIN" reads
      // as a role rather than as who owns the enquiry.
      return row.salesResponsible ? (
        <Tooltip
          content={
            row.salesResponsible.displayCode
              ? `${row.salesResponsible.name} (${row.salesResponsible.displayCode})`
              : row.salesResponsible.name
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <Avatar
              name={row.salesResponsible.name}
              color={row.salesResponsible.avatarColor}
              size="xs"
            />
            <span className="truncate">{row.salesResponsible.name}</span>
          </span>
        </Tooltip>
      ) : (
        <Empty />
      )

    case 'customerName':
      return <Truncated value={row.customerName} className="font-medium text-ink-900" />

    case 'projectName':
      return <Truncated value={row.projectName} />

    case 'status':
      return row.status ? (
        <ValueBadge
          label={row.status.label}
          color={row.status.color}
          inactive={!row.status.isActive}
          size="sm"
        />
      ) : (
        <Empty />
      )

    case 'location':
      return row.location ? (
        <ValueBadge
          label={row.location.label}
          color={row.location.color}
          inactive={!row.location.isActive}
          size="sm"
        />
      ) : (
        <Empty />
      )

    case 'material':
      return row.material ? (
        <ValueBadge
          label={row.material.label}
          color={row.material.color}
          inactive={!row.material.isActive}
          size="sm"
        />
      ) : (
        <Empty />
      )

    case 'enquiryDetails':
      return <Truncated value={row.enquiryDetails} />

    case 'quoteValue':
      return row.quoteValue === null ? (
        <Empty />
      ) : (
        <span className="tabular whitespace-nowrap font-semibold text-ink-900">
          {formatCurrency(row.quoteValue, currency)}
        </span>
      )

    case 'probability':
      return row.probability ? (
        <ProbabilityBadge
          label={row.probability.label}
          color={row.probability.color}
          numericValue={row.probability.numericValue}
          inactive={!row.probability.isActive}
        />
      ) : (
        <Empty />
      )

    case 'expectedOrderDate':
      return row.expectedOrderDate ? (
        <span className="tabular whitespace-nowrap">
          {formatCalendarDate(row.expectedOrderDate)}
        </span>
      ) : (
        <Empty />
      )

    case 'expectedBillingDate':
      return row.expectedBillingDate ? (
        <span className="tabular whitespace-nowrap">
          {formatCalendarDate(row.expectedBillingDate)}
        </span>
      ) : (
        <Empty />
      )

    case 'email':
      return row.email ? (
        <Tooltip content={row.email}>
          <a
            href={`mailto:${row.email}`}
            onClick={(event) => event.stopPropagation()}
            className="block truncate text-brand-600 underline-offset-2 hover:underline"
          >
            {row.email}
          </a>
        </Tooltip>
      ) : (
        <Empty />
      )

    case 'phoneNumber':
      return <Truncated value={row.phoneNumber} className="tabular" />

    case 'remarks':
      return <Truncated value={row.remarks} className="text-ink-500" />

    default:
      return <Empty />
  }
}

function Empty() {
  return <span className="text-ink-300">—</span>
}

/** Truncates with a tooltip, but only when the text is actually long. */
function Truncated({ value, className }: { value: string | null; className?: string }) {
  if (!value) return <Empty />
  const long = value.length > 28
  const node = <span className={cn('block truncate', className)}>{value}</span>
  return long ? <Tooltip content={value}>{node}</Tooltip> : node
}

function RowActions({
  row,
  canEdit,
  canRequestDelete,
  onEdit,
  onRequestDelete,
}: {
  row: PipelineRow
  canEdit: boolean
  canRequestDelete: boolean
  onEdit: () => void
  onRequestDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="iconXs"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Actions for job ${row.jobNo}`}
          className="opacity-0 transition-opacity group-hover/row:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          disabled={!canEdit}
          onSelect={onEdit}
          onClick={(event) => event.stopPropagation()}
        >
          <Pencil />
          {canEdit ? 'Edit request' : 'View only'}
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => {
            const text = [
              `Job ${row.jobNo}`,
              row.customerName,
              row.projectName,
              row.email,
              row.phoneNumber,
            ]
              .filter(Boolean)
              .join(' · ')
            void navigator.clipboard?.writeText(text)
          }}
        >
          <FileSpreadsheet />
          Copy row summary
        </DropdownMenuItem>

        {canRequestDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              disabled={Boolean(row.pendingDeleteRequest)}
              onSelect={onRequestDelete}
            >
              <Trash2 />
              {row.pendingDeleteRequest ? 'Deletion pending' : 'Request delete'}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SkeletonRows({ pinnedOffsets }: { pinnedOffsets: Map<PipelineColumnKey, number> }) {
  return (
    <>
      {Array.from({ length: 12 }).map((_, rowIndex) => (
        <tr key={rowIndex} className={cn(rowIndex % 2 === 1 && 'bg-ink-50/35')}>
          {PIPELINE_COLUMNS.map((column) => {
            const pinnedLeft = pinnedOffsets.get(column.key)
            return (
              <td
                key={column.key}
                style={{
                  width: column.width,
                  minWidth: column.minWidth,
                  ...(pinnedLeft !== undefined ? { left: pinnedLeft } : {}),
                }}
                className={cn(
                  'h-[46px] border-b border-ink-100/70 px-3',
                  pinnedLeft !== undefined &&
                    'sticky z-[5] bg-white shadow-[1px_0_0_0_var(--color-ink-100)]',
                )}
              >
                <Skeleton
                  className="h-3.5"
                  style={{
                    width: `${Math.max(38, Math.min(88, (column.width / 3) * 1.6))}%`,
                    // Stagger the shimmer so the block does not pulse in unison.
                    animationDelay: `${(rowIndex % 4) * 0.12}s`,
                  }}
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
