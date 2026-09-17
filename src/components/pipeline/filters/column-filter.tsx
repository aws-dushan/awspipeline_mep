'use client'

import * as React from 'react'
import { Filter, FilterX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Combobox, MultiSelect, type ComboboxOption } from '@/components/ui/combobox'
import { DateRangePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { EnquiryFilters } from '@/lib/filters/enquiry-filters'
import type { PipelineColumn } from '@/lib/pipeline/columns'
import { cn } from '@/lib/utils'

export type FilterOptions = {
  status: ComboboxOption[]
  location: ComboboxOption[]
  material: ComboboxOption[]
  probability: ComboboxOption[]
  users: ComboboxOption[]
  customers: ComboboxOption[]
}

export type ColumnFilterProps = {
  column: PipelineColumn
  filters: EnquiryFilters
  options: FilterOptions
  active: boolean
  onChange: (patch: Partial<EnquiryFilters>) => void
  onClear: () => void
}

/**
 * The filter control that sits in every column header.
 *
 * One component switches on the column's declared filter kind, so adding a
 * column to `PIPELINE_COLUMNS` gives it a working filter automatically rather
 * than requiring a bespoke menu.
 */
export function ColumnFilter({
  column,
  filters,
  options,
  active,
  onChange,
  onClear,
}: ColumnFilterProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${column.label}`}
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-[6px] transition-all duration-150',
            active
              ? 'bg-brand-100 text-brand-700 opacity-100'
              : 'text-ink-400 opacity-0 hover:bg-ink-200 hover:text-ink-700',
            // Revealed on header hover, or whenever it carries a value.
            'group-hover/header:opacity-100 focus-visible:opacity-100',
            open && 'bg-ink-200 text-ink-800 opacity-100',
          )}
        >
          <Filter className={cn('size-3', active && 'fill-current')} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[268px] p-0">
        <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
          <span className="text-[12px] font-semibold text-ink-800">{column.label}</span>
          {active ? (
            <button
              type="button"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
              className="flex items-center gap-1 text-[11.5px] font-medium text-ink-400 transition-colors hover:text-negative"
            >
              <FilterX className="size-3" />
              Clear
            </button>
          ) : null}
        </div>

        <FilterBody
          column={column}
          filters={filters}
          options={options}
          onChange={onChange}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

function FilterBody({
  column,
  filters,
  options,
  onChange,
  onDone,
}: {
  column: PipelineColumn
  filters: EnquiryFilters
  options: FilterOptions
  onChange: (patch: Partial<EnquiryFilters>) => void
  onDone: () => void
}) {
  switch (column.filter) {
    case 'text':
      return <TextFilter column={column} filters={filters} options={options} onChange={onChange} onDone={onDone} />


    case 'currency-range':
      return (
        <div className="flex flex-col gap-2.5 p-3">
          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-[11.5px] font-medium text-ink-400">Min</span>
            <Input
              autoFocus
              placeholder="Any"
              inputMode="decimal"
              className="h-8"
              defaultValue={filters.quoteValueMin ?? ''}
              onChange={(event) =>
                onChange({
                  quoteValueMin: event.target.value ? Number(event.target.value) : undefined,
                })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-[11.5px] font-medium text-ink-400">Max</span>
            <Input
              placeholder="Any"
              inputMode="decimal"
              className="h-8"
              defaultValue={filters.quoteValueMax ?? ''}
              onChange={(event) =>
                onChange({
                  quoteValueMax: event.target.value ? Number(event.target.value) : undefined,
                })
              }
            />
          </div>
        </div>
      )

    case 'date-range': {
      const keys = DATE_KEYS[column.key as keyof typeof DATE_KEYS]
      return (
        <div className="w-[268px] p-3">
          <DateRangePicker
            from={filters[keys.from] as string | undefined}
            to={filters[keys.to] as string | undefined}
            onChange={(range) =>
              onChange({ [keys.from]: range.from ?? undefined, [keys.to]: range.to ?? undefined })
            }
          />
        </div>
      )
    }

    case 'user-multi':
      return (
        <MultiSelect
          options={options.users}
          values={filters.salesResponsible ?? []}
          onChange={(values) => onChange({ salesResponsible: values.length ? values : undefined })}
          searchPlaceholder="Search people..."
          emptyText="No users in this company"
        />
      )

    case 'dropdown-multi': {
      const key = column.key as 'status' | 'location' | 'material' | 'probability'
      return (
        <MultiSelect
          options={options[key]}
          values={(filters[key] as string[] | undefined) ?? []}
          onChange={(values) => onChange({ [key]: values.length ? values : undefined })}
          searchPlaceholder={`Search ${column.label.toLowerCase()}...`}
          emptyText="No values configured"
        />
      )
    }

    default:
      return null
  }
}

const DATE_KEYS = {
  enquiryDate: { from: 'enquiryDateFrom', to: 'enquiryDateTo' },
  expectedOrderDate: { from: 'expectedOrderDateFrom', to: 'expectedOrderDateTo' },
  expectedBillingDate: { from: 'expectedBillingDateFrom', to: 'expectedBillingDateTo' },
} as const satisfies Record<string, { from: keyof EnquiryFilters; to: keyof EnquiryFilters }>

/**
 * Text filter.
 *
 * The Customer Name column also offers the existing customer list, because
 * picking a known name is faster and more accurate than typing a fragment of
 * it - while still allowing a free-text contains search.
 */
function TextFilter({
  column,
  filters,
  options,
  onChange,
  onDone,
}: {
  column: PipelineColumn
  filters: EnquiryFilters
  options: FilterOptions
  onChange: (patch: Partial<EnquiryFilters>) => void
  onDone: () => void
}) {
  const key = column.key as keyof EnquiryFilters
  const current = (filters[key] as string | undefined) ?? ''

  if (column.key === 'customerName' && options.customers.length > 0) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <Combobox
          compact
          options={options.customers}
          value={
            options.customers.find((option) => option.label === current)?.value ?? null
          }
          onChange={(value) => {
            const label = options.customers.find((option) => option.value === value)?.label
            onChange({ customerName: label ?? undefined })
          }}
          placeholder="Pick a customer"
          searchPlaceholder="Search customers..."
          emptyText="No customers yet"
        />
        <div className="relative">
          <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] font-medium uppercase tracking-wide text-ink-400">
            or contains
          </span>
          <Input
            className="h-8"
            placeholder="Type to search"
            defaultValue={current}
            onChange={(event) => onChange({ customerName: event.target.value || undefined })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onDone()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-3">
      <Input
        autoFocus
        placeholder={`Contains...`}
        defaultValue={current}
        onChange={(event) => onChange({ [key]: event.target.value || undefined })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onDone()
        }}
      />
    </div>
  )
}
