'use client'

import * as React from 'react'
import { Check, Pipette } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, readableForeground } from '@/lib/utils'

/**
 * Curated swatch set.
 *
 * Every colour here has been checked to keep a readable label when used as a
 * badge tint, so an admin cannot accidentally configure an unreadable status.
 * A custom hex is still allowed - the badge picks its foreground from the
 * colour's luminance.
 */
const SWATCHES = [
  '#DC2626', '#EA580C', '#D97706', '#CA8A04',
  '#65A30D', '#059669', '#0D9488', '#0891B2',
  '#0284C7', '#2563EB', '#4F46E5', '#7C3AED',
  '#9333EA', '#C026D3', '#DB2777', '#E11D48',
  '#475569', '#64748B', '#0F172A', '#78716C',
]

export function ColorPicker({
  value,
  onChange,
  allowEmpty = false,
  className,
}: {
  value: string | null
  onChange: (value: string | null) => void
  allowEmpty?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(value ?? '')

  React.useEffect(() => setDraft(value ?? ''), [value])

  function commitDraft(next: string) {
    setDraft(next)
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
      onChange(next.toUpperCase())
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center gap-2.5 rounded-md border border-ink-200 bg-white px-2.5 text-left text-[13.5px] shadow-xs',
            'transition-[border-color,box-shadow] duration-150 hover:border-ink-300',
            'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12',
            className,
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-5 shrink-0 rounded-[6px] ring-1 ring-inset ring-black/10',
              !value && 'bg-ink-100',
            )}
            style={value ? { backgroundColor: value } : undefined}
          />
          <span className={cn('flex-1 truncate tabular', !value && 'text-ink-400')}>
            {value ?? 'No colour'}
          </span>
          <Pipette className="size-3.5 shrink-0 text-ink-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[248px] p-3">
        <div className="grid grid-cols-5 gap-1.5">
          {SWATCHES.map((swatch) => {
            const selected = value?.toUpperCase() === swatch
            return (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                onClick={() => {
                  onChange(swatch)
                  setOpen(false)
                }}
                className={cn(
                  'grid size-9 place-items-center rounded-md ring-1 ring-inset ring-black/10',
                  'transition-transform duration-150 hover:scale-[1.08]',
                )}
                style={{ backgroundColor: swatch }}
              >
                {selected ? (
                  <Check
                    className="size-4"
                    strokeWidth={3}
                    style={{ color: readableForeground(swatch) }}
                  />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3">
          <Input
            className="h-8 tabular"
            value={draft}
            onChange={(event) => commitDraft(event.target.value)}
            maxLength={7}
          />
          {allowEmpty ? (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="shrink-0 rounded-sm px-2 py-1 text-[12px] font-medium text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
