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
  Check,
  Clock3,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'

import { ColumnFilter, type FilterOptions } from '@/components/pipeline/filters/column-filter'
import {
  FIELD_BY_COLUMN,
  InlineCellEditor,
  type DraftPatch,
} from '@/components/pipeline/inline-cell-editor'
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
import { formatCalendarDate, formatCurrency } from '@/lib/format'
import {
  SORTABLE_KEYS,
  type EnquiryFilters,
  type SortableKey,
} from '@/lib/filters/enquiry-filters'
import { enquiryToFormValues } from '@/lib/pipeline/enquiry-draft'
import { PIPELINE_COLUMNS, type PipelineColumnKey } from '@/lib/pipeline/columns'
import type { EnquiryFormInput } from '@/lib/validation/enquiry'
import { cn } from '@/lib/utils'

const SORTABLE = new Set<string>(SORTABLE_KEYS)

/**
 * Where the caret lands when a row is opened for editing.
 *
 * The leftmost editable *text* column. The pickers to its left open on click
 * rather than on focus, so starting there would leave the caret nowhere
 * visible; Job No, further left again, is issued by the server and has no
 * editor at all.
 */
const FIRST_EDITABLE_COLUMN: PipelineColumnKey = 'projectName'

/** Width of the pinned row-actions column, in pixels. */
const ACTIONS_WIDTH = 52

/**
 * Total grid width, and the reason the table uses `table-layout: fixed`.
 *
 * In the default auto layout a browser ignores `max-width` on a cell and
 * widens columns to fit their content. Sticky offsets are computed from the
 * declared widths, so a column that renders wider than declared pushes the
 * next pinned column on top of it - which is what used to hide the leftmost
 * pinned column behind the one after it.
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
  /**
   * Save a row edited in place. Returns field errors so the offending cells
   * can be marked without closing the row and losing the rest of the edit.
   */
  onInlineSave: (
    row: PipelineRow,
    values: EnquiryFormInput,
  ) => Promise<{ ok: boolean; fieldErrors?: Record<string, string> }>
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
  onInlineSave,
  onRequestDelete,
  onFilterChange,
  onClearColumn,
  onSort,
  emptyState,
}: PipelineGridProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  /*
   * Editing happens in the row itself.
   *
   * Only one row at a time: two open drafts would make "unsaved changes" a
   * question with more than one answer, and the grid has nowhere to ask it.
   *
   * The draft is mirrored into a ref and every change goes through
   * `updateEditing`, so a handler can read the current draft the instant it
   * runs. Reading it out of a `setState` updater instead looks equivalent and
   * is not: React only runs those eagerly when the component has no pending
   * work, so a save would sometimes see the draft and sometimes see nothing
   * and return without doing anything at all.
   */
  type EditState = {
    id: string
    draft: EnquiryFormInput
    errors: Record<string, string>
    saving: boolean
  }

  const [editing, setEditingState] = React.useState<EditState | null>(null)
  const editingRef = React.useRef<EditState | null>(null)

  const updateEditing = React.useCallback(
    (next: EditState | null | ((current: EditState | null) => EditState | null)) => {
      const resolved = typeof next === 'function' ? next(editingRef.current) : next
      editingRef.current = resolved
      setEditingState(resolved)
    },
    [],
  )

  const beginEdit = React.useCallback(
    (record: PipelineRow) => {
      setSelectedId(record.id)
      updateEditing({ id: record.id, draft: enquiryToFormValues(record), errors: {}, saving: false })
    },
    [updateEditing],
  )

  const cancelEdit = React.useCallback(() => updateEditing(null), [updateEditing])

  const patchDraft = React.useCallback(
    (patch: DraftPatch) => {
      updateEditing((current) => {
        if (!current) return current
        // Clear the error on anything just touched: leaving a cell red after it
        // has been corrected reads as a second, phantom problem.
        const errors = { ...current.errors }
        for (const key of Object.keys(patch)) delete errors[key]
        return { ...current, draft: { ...current.draft, ...patch }, errors }
      })
    },
    [updateEditing],
  )

  const saveEdit = React.useCallback(
    async (record: PipelineRow) => {
      const current = editingRef.current
      if (!current || current.saving || current.id !== record.id) return

      updateEditing({ ...current, saving: true })
      const result = await onInlineSave(record, current.draft)

      if (result.ok) {
        updateEditing(null)
        return
      }
      updateEditing((latest) =>
        latest ? { ...latest, saving: false, errors: result.fieldErrors ?? {} } : latest,
      )
    },
    [onInlineSave, updateEditing],
  )

  /**
   * Escape cancels, Enter saves - from anywhere in the row.
   *
   * Listened for on the window rather than on the row, because the pickers
   * render their menus in a portal outside the table: a handler on the row
   * never sees a key pressed while a dropdown is open. An open menu gets first
   * refusal on both keys, and so does a textarea, where Enter means a new line.
   */
  const editingId = editing?.id ?? null
  React.useEffect(() => {
    if (!editingId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return
      if (event.defaultPrevented) return
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return

      const target = event.target as HTMLElement | null
      if (event.key === 'Enter' && target?.tagName === 'TEXTAREA') return

      const record = rows.find((candidate) => candidate.id === editingId)
      if (!record) return

      event.preventDefault()
      if (event.key === 'Escape') cancelEdit()
      else void saveEditRef.current?.(record)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingId, rows, cancelEdit])

  const saveEditRef = React.useRef(saveEdit)
  React.useEffect(() => {
    saveEditRef.current = saveEdit
  }, [saveEdit])

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
   * Left-pinned columns: row actions first, then Job No. Keeping those two
   * fixed is what makes the grid navigable - you always know which row you are
   * reading, and can act on it without scrolling back.
   *
   * Offsets are cumulative declared widths, so every pinned cell has to be
   * exactly as wide as it claims. A cell allowed to grow past its declared
   * width ends up underneath the next pinned cell, which is what previously
   * hid one pinned column behind another once the grid was scrolled.
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
                            ) : null}
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

              const rowEdit = editing?.id === record.id ? editing : null

              return (
                <tr
                  key={record.id}
                  onClick={() => !rowEdit && setSelectedId(record.id)}
                  onDoubleClick={() => {
                    if (rowEdit || !canEdit(record)) return
                    beginEdit(record)
                  }}
                  className={cn(
                    'group/row cursor-default transition-colors duration-100',
                    index % 2 === 1 && 'bg-ink-50/35',
                    'hover:bg-brand-50/45',
                    selected && 'bg-brand-50/70 hover:bg-brand-50/70',
                    highlightedIds.has(record.id) && 'row-flash',
                    pendingDelete && 'opacity-[0.94]',
                    rowEdit && 'bg-brand-50/70 hover:bg-brand-50/70',
                    rowEdit?.saving && 'pointer-events-none opacity-70',
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
                    {rowEdit ? (
                      <span className="flex items-center justify-center gap-0.5">
                        <Tooltip content="Save (Enter)">
                          <Button
                            variant="ghost"
                            size="iconXs"
                            aria-label="Save changes"
                            loading={rowEdit.saving}
                            onClick={(event) => {
                              event.stopPropagation()
                              void saveEdit(record)
                            }}
                            className="text-positive hover:bg-positive-soft"
                          >
                            <Check />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Cancel (Esc)">
                          <Button
                            variant="ghost"
                            size="iconXs"
                            aria-label="Cancel editing"
                            onClick={(event) => {
                              event.stopPropagation()
                              cancelEdit()
                            }}
                            className="text-ink-400 hover:text-ink-700"
                          >
                            <X />
                          </Button>
                        </Tooltip>
                      </span>
                    ) : (
                      <RowActions
                        row={record}
                        canEdit={canEdit(record)}
                        canRequestDelete={canRequestDelete}
                        onEdit={() => onEdit(record)}
                        onRequestDelete={() => onRequestDelete(record)}
                      />
                    )}
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
                          'h-[46px] border-b border-ink-100/70 text-[13px] text-ink-700',
                          rowEdit && FIELD_BY_COLUMN[column.key] ? 'px-1' : 'px-3',
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
                        {rowEdit && FIELD_BY_COLUMN[column.key] ? (
                          <InlineCellEditor
                            column={column}
                            draft={rowEdit.draft}
                            options={filterOptions}
                            currency={currency}
                            autoFocus={column.key === FIRST_EDITABLE_COLUMN}
                            invalid={Boolean(rowEdit.errors[FIELD_BY_COLUMN[column.key]!])}
                            onPatch={patchDraft}
                          />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
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
      return row.enquiryDate ? (
        <span className="tabular whitespace-nowrap">{formatCalendarDate(row.enquiryDate)}</span>
      ) : (
        <Empty />
      )

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

  /*
   * These fields can hold several lines. A row is one line tall, so the cell
   * shows the text with its breaks turned into spaces - otherwise only the
   * first line appears and the rest reads as missing. The tooltip keeps the
   * breaks, which is where the text is actually read.
   */
  const multiline = value.includes('\n')
  const inline = multiline ? value.replace(/\s*\n\s*/g, ' · ') : value
  const node = <span className={cn('block truncate', className)}>{inline}</span>
  if (!multiline && inline.length <= 28) return node

  return (
    <Tooltip content={<span className="block whitespace-pre-wrap">{value}</span>}>{node}</Tooltip>
  )
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
          className="text-ink-400 transition-colors hover:text-ink-700 data-[state=open]:text-ink-900"
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
