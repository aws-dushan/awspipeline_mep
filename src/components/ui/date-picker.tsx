'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import {
  addMonths,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import 'react-day-picker/style.css'

/**
 * Calendar styling.
 *
 * react-day-picker ships its own class names; these override them so the
 * calendar matches the rest of the product rather than looking bolted on.
 */
const calendarClassNames = {
  months: 'relative',
  month: 'space-y-3',
  month_caption: 'flex items-center justify-center h-8 relative',
  caption_label: 'text-[13.5px] font-semibold text-ink-900',
  nav: 'absolute inset-x-0 top-0 flex items-center justify-between h-8 px-0.5 z-10',
  button_previous:
    'grid size-7 place-items-center rounded-sm text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-35',
  button_next:
    'grid size-7 place-items-center rounded-sm text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-35',
  month_grid: 'w-full border-collapse',
  weekdays: 'flex',
  weekday: 'w-9 text-[11px] font-medium uppercase tracking-wide text-ink-400',
  week: 'flex w-full mt-1',
  day: 'p-0 relative',
  day_button: cn(
    'grid size-9 place-items-center rounded-md text-[13px] font-medium text-ink-700',
    'transition-all duration-120 ease-out-quart',
    'hover:bg-brand-50 hover:text-brand-700',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15',
  ),
  selected:
    '[&>button]:bg-brand-600 [&>button]:text-white [&>button]:shadow-sm [&>button:hover]:bg-brand-700 [&>button:hover]:text-white',
  today: '[&>button]:font-bold [&>button]:text-brand-600 [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-brand-200',
  outside: '[&>button]:text-ink-300',
  disabled: '[&>button]:opacity-35 [&>button]:pointer-events-none',
  hidden: 'invisible',
} as const

export type DatePickerProps = {
  /** `yyyy-MM-dd`, or empty. */
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  clearable?: boolean
  id?: string
  className?: string
  /** Rendered small and borderless, for use inside a filter menu. */
  compact?: boolean
  fromYear?: number
  toYear?: number
}

const WIRE_FORMAT = 'yyyy-MM-dd'

function parseWire(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, WIRE_FORMAT, new Date())
  return isValid(parsed) ? parsed : undefined
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  invalid,
  disabled,
  clearable = true,
  id,
  className,
  compact,
  fromYear = new Date().getFullYear() - 6,
  toYear = new Date().getFullYear() + 6,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseWire(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            'group flex w-full items-center gap-2 rounded-md border bg-white text-left text-[13.5px] shadow-xs',
            'transition-[border-color,box-shadow] duration-150 ease-out-quart',
            'border-ink-200 hover:border-ink-300',
            'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12',
            'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
            compact ? 'h-8 px-2.5' : 'h-9 px-3',
            invalid && 'border-negative focus:border-negative focus:ring-red-500/12',
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-ink-400 transition-colors group-hover:text-ink-500" />
          <span className={cn('flex-1 truncate', !selected && 'text-ink-400')}>
            {selected ? format(selected, 'dd MMM yyyy') : placeholder}
          </span>
          {clearable && selected && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              onClick={(event) => {
                event.stopPropagation()
                onChange(null)
              }}
              className="grid size-5 shrink-0 place-items-center rounded text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
            >
              <X className="size-3.5" />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-3" align="start">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={new Date(toYear, 11)}
          weekStartsOn={0}
          showOutsideDays
          classNames={calendarClassNames}
          components={{
            Chevron: ({ orientation }) =>
              orientation === 'left' ? (
                <ChevronLeft className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              ),
          }}
          onSelect={(date) => {
            onChange(date ? format(date, WIRE_FORMAT) : null)
            setOpen(false)
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-100 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onChange(format(new Date(), WIRE_FORMAT))
              setOpen(false)
            }}
          >
            Today
          </Button>
          {clearable ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-ink-400"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/* -------------------------------------------------------------------------- */
/*  Date range with quick presets                                             */
/* -------------------------------------------------------------------------- */

type DateRange = { from: string | null; to: string | null }

const iso = (date: Date) => format(date, WIRE_FORMAT)

/**
 * Relative ranges, resolved when clicked rather than stored.
 *
 * "This month" filed in September must still mean September when the page is
 * reopened in October, so the preset writes concrete dates into the filter
 * instead of persisting a keyword.
 */
export const DATE_PRESETS: { key: string; label: string; resolve: () => DateRange }[] = [
  {
    key: 'today',
    label: 'Today',
    resolve: () => ({ from: iso(new Date()), to: iso(new Date()) }),
  },
  {
    key: 'yesterday',
    label: 'Yesterday',
    resolve: () => {
      const day = subDays(new Date(), 1)
      return { from: iso(day), to: iso(day) }
    },
  },
  {
    key: 'last7',
    label: 'Last 7 days',
    resolve: () => ({ from: iso(subDays(new Date(), 6)), to: iso(new Date()) }),
  },
  {
    key: 'last30',
    label: 'Last 30 days',
    resolve: () => ({ from: iso(subDays(new Date(), 29)), to: iso(new Date()) }),
  },
  {
    key: 'thisWeek',
    label: 'This week',
    resolve: () => ({
      from: iso(startOfWeek(new Date(), { weekStartsOn: 1 })),
      to: iso(endOfWeek(new Date(), { weekStartsOn: 1 })),
    }),
  },
  {
    key: 'thisMonth',
    label: 'This month',
    resolve: () => ({ from: iso(startOfMonth(new Date())), to: iso(endOfMonth(new Date())) }),
  },
  {
    key: 'lastMonth',
    label: 'Last month',
    resolve: () => {
      const previous = subMonths(new Date(), 1)
      return { from: iso(startOfMonth(previous)), to: iso(endOfMonth(previous)) }
    },
  },
  {
    key: 'thisQuarter',
    label: 'This quarter',
    resolve: () => ({
      from: iso(startOfQuarter(new Date())),
      to: iso(endOfQuarter(new Date())),
    }),
  },
  {
    key: 'thisYear',
    label: 'This year',
    resolve: () => ({ from: iso(startOfYear(new Date())), to: iso(endOfYear(new Date())) }),
  },
  {
    key: 'nextMonth',
    label: 'Next month',
    resolve: () => {
      const next = addMonths(new Date(), 1)
      return { from: iso(startOfMonth(next)), to: iso(endOfMonth(next)) }
    },
  },
]

/** Two linked date fields plus quick presets, used by every date column. */
export function DateRangePicker({
  from,
  to,
  onChange,
  disabled,
}: {
  from: string | null | undefined
  to: string | null | undefined
  onChange: (range: DateRange) => void
  disabled?: boolean
}) {
  // Highlights whichever preset the current range happens to match, so a range
  // set last week still reads as "This month" when that is what it is.
  const activePreset = React.useMemo(() => {
    if (!from || !to) return null
    return (
      DATE_PRESETS.find((preset) => {
        const range = preset.resolve()
        return range.from === from && range.to === to
      })?.key ?? null
    )
  }, [from, to])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.resolve())}
            className={cn(
              'rounded-sm px-2 py-[5px] text-left text-[12px] font-medium transition-colors duration-100',
              activePreset === preset.key
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-ink-100 pt-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-400">
          Custom
        </span>
        <span className="h-px flex-1 bg-ink-100" aria-hidden />
        {from || to ? (
          <button
            type="button"
            onClick={() => onChange({ from: null, to: null })}
            className="text-[11.5px] font-medium text-ink-400 transition-colors hover:text-negative"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-[11.5px] font-medium text-ink-400">From</span>
          <DatePicker
            compact
            value={from}
            disabled={disabled}
            placeholder="Any"
            onChange={(value) => onChange({ from: value, to: to ?? null })}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-[11.5px] font-medium text-ink-400">To</span>
          <DatePicker
            compact
            value={to}
            disabled={disabled}
            placeholder="Any"
            onChange={(value) => onChange({ from: from ?? null, to: value })}
          />
        </div>
      </div>
    </div>
  )
}
