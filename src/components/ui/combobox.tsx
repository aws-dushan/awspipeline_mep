'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react'

import { CheckboxVisual } from '@/components/ui/primitives'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type ComboboxOption = {
  value: string
  label: string
  /** Secondary line, e.g. a customer's email. */
  description?: string | null
  /** Small leading swatch or avatar. */
  leading?: React.ReactNode
  disabled?: boolean
  /** Extra text included in search matching but not displayed. */
  keywords?: string
}

function matches(option: ComboboxOption, query: string) {
  if (!query) return true
  const haystack = `${option.label} ${option.description ?? ''} ${option.keywords ?? ''}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

/* -------------------------------------------------------------------------- */
/*  Single-select combobox, optionally with inline create                     */
/* -------------------------------------------------------------------------- */

export type ComboboxProps = {
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  invalid?: boolean
  disabled?: boolean
  clearable?: boolean
  id?: string
  className?: string
  compact?: boolean
  loading?: boolean
  /**
   * Enables the "Add <query>" row at the bottom of the list. Returning a
   * string selects that value immediately; returning null closes the list so
   * the caller can take over with its own dialog.
   */
  onCreate?: (label: string) => Promise<string | null> | string | null
  createLabel?: (query: string) => string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results',
  invalid,
  disabled,
  clearable = true,
  id,
  className,
  compact,
  loading,
  onCreate,
  createLabel = (query) => `Add "${query}"`,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const selected = options.find((option) => option.value === value) ?? null
  const filtered = React.useMemo(
    () => options.filter((option) => matches(option, query)),
    [options, query],
  )

  const exactMatch = filtered.some(
    (option) => option.label.trim().toLowerCase() === query.trim().toLowerCase(),
  )
  const showCreate = Boolean(onCreate) && query.trim().length >= 2 && !exactMatch

  // Reset the highlight whenever the candidate list changes, so the keyboard
  // never points at a row that has scrolled out of the result set.
  React.useEffect(() => setActiveIndex(0), [query, open])

  const rowCount = filtered.length + (showCreate ? 1 : 0)

  async function handleCreate() {
    if (!onCreate) return
    setCreating(true)
    try {
      const created = await onCreate(query.trim())
      if (created) onChange(created)
      // Close either way: a null result means the caller is opening a dialog,
      // and leaving a popover behind it traps focus.
      setOpen(false)
      setQuery('')
    } finally {
      setCreating(false)
    }
  }

  function commit(index: number) {
    if (showCreate && index === filtered.length) {
      void handleCreate()
      return
    }
    const option = filtered[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
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
          {selected?.leading}
          <span className={cn('flex-1 truncate', !selected && 'text-ink-400')}>
            {selected?.label ?? placeholder}
          </span>
          {clearable && selected && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={(event) => {
                event.stopPropagation()
                onChange(null)
              }}
              className="grid size-5 shrink-0 place-items-center rounded text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
            >
              <X className="size-3.5" />
            </span>
          ) : null}
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[260px] p-0"
        align="start"
        onOpenAutoFocus={(event) => {
          // Focus the search box, not the first row - typing should filter.
          event.preventDefault()
          searchRef.current?.focus()
        }}
      >
        <div className="flex items-center gap-2 border-b border-ink-100 px-3">
          <Search className="size-3.5 shrink-0 text-ink-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full bg-transparent text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((index) => Math.min(index + 1, rowCount - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                commit(activeIndex)
              }
            }}
          />
        </div>

        <div ref={listRef} className="scroll-polished max-h-[280px] overflow-y-auto p-1.5">
          {loading ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-ink-400">Loading...</p>
          ) : filtered.length === 0 && !showCreate ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-ink-400">{emptyText}</p>
          ) : null}

          {filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-sm px-2 py-[7px] text-left text-[13px] text-ink-700',
                'transition-colors duration-100',
                index === activeIndex && 'bg-brand-50 text-brand-800',
                option.disabled && 'pointer-events-none opacity-45',
              )}
            >
              {option.leading}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{option.label}</span>
                {option.description ? (
                  <span className="block truncate text-[11.5px] text-ink-400">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {option.value === value ? (
                <Check className="size-3.5 shrink-0 text-brand-600" />
              ) : null}
            </button>
          ))}

          {showCreate ? (
            <button
              type="button"
              disabled={creating}
              onMouseEnter={() => setActiveIndex(filtered.length)}
              onClick={() => void handleCreate()}
              className={cn(
                'mt-1 flex w-full items-center gap-2.5 rounded-sm border-t border-ink-100 px-2 py-[9px] text-left text-[13px] font-medium text-brand-700',
                'transition-colors duration-100',
                activeIndex === filtered.length && 'bg-brand-50',
                creating && 'opacity-60',
              )}
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="truncate">{createLabel(query.trim())}</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/* -------------------------------------------------------------------------- */
/*  Multi-select, used by the column filters                                  */
/* -------------------------------------------------------------------------- */

export function MultiSelect({
  options,
  values,
  onChange,
  searchPlaceholder = 'Search...',
  emptyText = 'No options',
  maxHeight = 260,
  showSearch = true,
  footer,
}: {
  options: ComboboxOption[]
  values: string[]
  onChange: (values: string[]) => void
  searchPlaceholder?: string
  emptyText?: string
  maxHeight?: number
  showSearch?: boolean
  footer?: React.ReactNode
}) {
  const [query, setQuery] = React.useState('')
  const filtered = React.useMemo(
    () => options.filter((option) => matches(option, query)),
    [options, query],
  )
  const selectedSet = React.useMemo(() => new Set(values), [values])

  function toggle(value: string) {
    onChange(
      selectedSet.has(value) ? values.filter((item) => item !== value) : [...values, value],
    )
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((option) => selectedSet.has(option.value))

  return (
    <div className="flex flex-col">
      {showSearch && options.length > 6 ? (
        <div className="flex items-center gap-2 border-b border-ink-100 px-3">
          <Search className="size-3.5 shrink-0 text-ink-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full bg-transparent text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
        </div>
      ) : null}

      {filtered.length > 1 ? (
        <button
          type="button"
          onClick={() =>
            onChange(
              allFilteredSelected
                ? values.filter((value) => !filtered.some((option) => option.value === value))
                : Array.from(new Set([...values, ...filtered.map((option) => option.value)])),
            )
          }
          className="flex items-center gap-2.5 border-b border-ink-100 px-3 py-2 text-left text-[12px] font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800"
        >
          <CheckboxVisual checked={allFilteredSelected} />
          {allFilteredSelected ? 'Clear all' : 'Select all'}
          <span className="ml-auto text-ink-400 tabular">{filtered.length}</span>
        </button>
      ) : null}

      <div className="scroll-polished overflow-y-auto p-1.5" style={{ maxHeight }}>
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] text-ink-400">{emptyText}</p>
        ) : null}

        {filtered.map((option) => {
          const checked = selectedSet.has(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-sm px-2 py-[7px] text-left text-[13px]',
                'transition-colors duration-100 hover:bg-ink-50',
                checked ? 'text-ink-900' : 'text-ink-600',
              )}
            >
              <CheckboxVisual checked={checked} />
              {option.leading}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.description ? (
                <span className="shrink-0 text-[11px] text-ink-400 tabular">{option.description}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <AnimatePresence>
        {footer ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-ink-100"
          >
            {footer}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
