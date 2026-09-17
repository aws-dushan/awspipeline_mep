'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Plus, Search, SlidersHorizontal, X } from 'lucide-react'

import type { FilterOptions } from '@/components/pipeline/filters/column-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/primitives'
import { formatCalendarDate, formatCurrency, formatNumber } from '@/lib/format'
import type { EnquiryFilters } from '@/lib/filters/enquiry-filters'
import { columnLabel, type PipelineColumnKey } from '@/lib/pipeline/columns'
import { cn } from '@/lib/utils'

const EASE = [0.25, 1, 0.5, 1] as const

export type ToolbarSummary = {
  total: number
  totalQuoteValue: number
}

export function PipelineToolbar({
  companyName,
  currency,
  summary,
  filters,
  filterCount,
  filterOptions,
  searchValue,
  onSearchChange,
  onClearFilters,
  onRemoveFilter,
  onAddRequest,
  onExport,
  exporting,
  canCreate,
  canExport,
  loading,
}: {
  companyName: string
  currency: string
  summary: ToolbarSummary
  filters: EnquiryFilters
  filterCount: number
  filterOptions: FilterOptions
  searchValue: string
  onSearchChange: (value: string) => void
  onClearFilters: () => void
  onRemoveFilter: (column: PipelineColumnKey) => void
  onAddRequest: () => void
  onExport: () => void
  exporting: boolean
  canCreate: boolean
  canExport: boolean
  loading: boolean
}) {
  const chips = React.useMemo(
    () => describeActiveFilters(filters, filterOptions, currency),
    [filters, filterOptions, currency],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink-900">Pipeline</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {loading && summary.total === 0 ? (
              <span className="inline-block h-3 w-40 animate-pulse rounded bg-ink-100" />
            ) : (
              <>
                <span className="font-medium text-ink-700 tabular">
                  {formatNumber(summary.total)}
                </span>{' '}
                {summary.total === 1 ? 'request' : 'requests'}
                {filterCount > 0 ? ' matching filters' : ''} · {companyName}
              </>
            )}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-[220px] sm:w-[260px]">
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search job, customer, project..."
              leading={<Search />}
              aria-label="Search the pipeline"
              trailing={
                searchValue ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="Clear search"
                    className="grid size-5 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : undefined
              }
            />
          </div>

          {canExport ? (
            <Tooltip
              content={
                filterCount > 0
                  ? 'Exports every row matching the current filters'
                  : 'Exports the full pipeline for this company'
              }
            >
              <Button
                variant="secondary"
                onClick={onExport}
                loading={exporting}
                loadingText="Preparing..."
              >
                <Download />
                Export Excel
              </Button>
            </Tooltip>
          ) : null}

          {canCreate ? (
            <Button variant="primary" onClick={onAddRequest} className="group">
              <Plus className="transition-transform duration-200 group-hover:rotate-90" />
              Add Request
            </Button>
          ) : null}
        </div>
      </div>

      {/* Summary strip - aggregates over the whole filtered set, not the page */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-ink-100 bg-white px-4 py-2.5 shadow-xs">
        <SummaryStat
          label="Pipeline value"
          value={formatCurrency(summary.totalQuoteValue, currency, { compact: summary.totalQuoteValue >= 1_000_000 })}
          loading={loading && summary.total === 0}
        />
        <span className="h-6 w-px bg-ink-100" aria-hidden />
        <SummaryStat
          label="Requests"
          value={formatNumber(summary.total)}
          loading={loading && summary.total === 0}
        />

        <div className="ml-auto flex items-center gap-2">
          <AnimatePresence initial={false}>
            {filterCount > 0 ? (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.16, ease: EASE }}
                className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700"
              >
                <SlidersHorizontal className="size-3" />
                {filterCount} {filterCount === 1 ? 'filter' : 'filters'}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Active filter chips */}
      <AnimatePresence initial={false}>
        {chips.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              {chips.map((chip) => (
                <motion.button
                  key={chip.column}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.15, ease: EASE }}
                  onClick={() => onRemoveFilter(chip.column)}
                  className={cn(
                    'group flex max-w-[320px] items-center gap-1.5 rounded-full border border-ink-200 bg-white py-1 pl-2.5 pr-1.5',
                    'text-[12px] transition-colors duration-150 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  <span className="font-medium text-ink-500">{chip.label}</span>
                  <span className="truncate text-ink-800">{chip.value}</span>
                  <span className="grid size-4 shrink-0 place-items-center rounded-full text-ink-300 transition-colors group-hover:bg-ink-200 group-hover:text-ink-700">
                    <X className="size-2.5" />
                  </span>
                </motion.button>
              ))}

              <button
                type="button"
                onClick={onClearFilters}
                className="ml-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-400 transition-colors hover:bg-negative-soft hover:text-negative"
              >
                Clear all filters
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  hint,
  loading,
  className,
}: {
  label: string
  value: string
  hint?: string
  loading?: boolean
  className?: string
}) {
  const content = (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-400">
        {label}
      </span>
      {loading ? (
        <span className="mt-0.5 h-4 w-24 animate-pulse rounded bg-ink-100" />
      ) : (
        <span className="truncate text-[14.5px] font-semibold text-ink-900 tabular">{value}</span>
      )}
    </div>
  )

  return hint ? <Tooltip content={hint}>{content}</Tooltip> : content
}

/* -------------------------------------------------------------------------- */
/*  Active filter descriptions                                                */
/* -------------------------------------------------------------------------- */

type Chip = { column: PipelineColumnKey; label: string; value: string }

function describeActiveFilters(
  filters: EnquiryFilters,
  options: FilterOptions,
  currency: string,
): Chip[] {
  const chips: Chip[] = []

  const labelsFor = (ids: string[] | undefined, source: { value: string; label: string }[]) =>
    (ids ?? [])
      .map((id) => source.find((option) => option.value === id)?.label ?? null)
      .filter((label): label is string => Boolean(label))

  const joinLabels = (labels: string[]) =>
    labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`

  const range = (from?: string | number | null, to?: string | number | null, format?: (v: string | number) => string) => {
    const fmt = format ?? ((v: string | number) => String(v))
    if (from && to) return `${fmt(from)} – ${fmt(to)}`
    if (from) return `from ${fmt(from)}`
    if (to) return `up to ${fmt(to)}`
    return ''
  }


  if (filters.jobNo) chips.push({ column: 'jobNo', label: 'Job No', value: filters.jobNo })

  if (filters.enquiryDateFrom || filters.enquiryDateTo) {
    chips.push({
      column: 'enquiryDate',
      label: columnLabel('enquiryDate'),
      value: range(filters.enquiryDateFrom, filters.enquiryDateTo, (v) => formatCalendarDate(String(v))),
    })
  }

  if (filters.salesResponsible?.length) {
    chips.push({
      column: 'salesResponsible',
      label: 'Sales',
      value: joinLabels(labelsFor(filters.salesResponsible, options.users)),
    })
  }

  if (filters.customerName) {
    chips.push({ column: 'customerName', label: 'Customer', value: filters.customerName })
  }
  if (filters.projectName) {
    chips.push({ column: 'projectName', label: 'Project', value: filters.projectName })
  }

  if (filters.status?.length) {
    chips.push({
      column: 'status',
      label: 'Status',
      value: joinLabels(labelsFor(filters.status, options.status)),
    })
  }
  if (filters.location?.length) {
    chips.push({
      column: 'location',
      label: 'Location',
      value: joinLabels(labelsFor(filters.location, options.location)),
    })
  }
  if (filters.material?.length) {
    chips.push({
      column: 'material',
      label: 'Material',
      value: joinLabels(labelsFor(filters.material, options.material)),
    })
  }
  if (filters.probability?.length) {
    chips.push({
      column: 'probability',
      label: 'Probability',
      value: joinLabels(labelsFor(filters.probability, options.probability)),
    })
  }

  if (filters.enquiryDetails) {
    chips.push({ column: 'enquiryDetails', label: 'Details', value: filters.enquiryDetails })
  }

  if (filters.quoteValueMin !== undefined || filters.quoteValueMax !== undefined) {
    chips.push({
      column: 'quoteValue',
      label: 'Quote',
      value: range(filters.quoteValueMin, filters.quoteValueMax, (v) =>
        formatCurrency(Number(v), currency, { compact: true }),
      ),
    })
  }

  if (filters.expectedOrderDateFrom || filters.expectedOrderDateTo) {
    chips.push({
      column: 'expectedOrderDate',
      label: 'Order date',
      value: range(filters.expectedOrderDateFrom, filters.expectedOrderDateTo, (v) =>
        formatCalendarDate(String(v)),
      ),
    })
  }
  if (filters.expectedBillingDateFrom || filters.expectedBillingDateTo) {
    chips.push({
      column: 'expectedBillingDate',
      label: 'Billing date',
      value: range(filters.expectedBillingDateFrom, filters.expectedBillingDateTo, (v) =>
        formatCalendarDate(String(v)),
      ),
    })
  }

  if (filters.email) chips.push({ column: 'email', label: 'Email', value: filters.email })
  if (filters.phoneNumber) {
    chips.push({ column: 'phoneNumber', label: 'Phone', value: filters.phoneNumber })
  }
  if (filters.remarks) chips.push({ column: 'remarks', label: 'Remarks', value: filters.remarks })

  return chips
}
