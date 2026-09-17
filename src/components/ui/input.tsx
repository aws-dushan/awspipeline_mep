'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export type InputProps = React.ComponentProps<'input'> & {
  invalid?: boolean
  /** Rendered inside the field on the left (icon or short prefix). */
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leading, trailing, type = 'text', ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border bg-white px-3 text-[13.5px] text-ink-900 shadow-xs',
        'placeholder:text-ink-400',
        'transition-[border-color,box-shadow,background-color] duration-150 ease-out-quart',
        'border-ink-200 hover:border-ink-300',
        'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12',
        'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
        invalid &&
          'border-negative hover:border-negative focus:border-negative focus:ring-red-500/12',
        leading && 'pl-9',
        trailing && 'pr-9',
        className,
      )}
      {...props}
    />
  )

  if (!leading && !trailing) return field

  return (
    <div className="relative">
      {leading ? (
        <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-ink-400 [&_svg]:size-4">
          {leading}
        </span>
      ) : null}
      {field}
      {trailing ? (
        <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center text-ink-400 [&_svg]:size-4">
          {trailing}
        </span>
      ) : null}
    </div>
  )
})

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full resize-y rounded-md border bg-white px-3 py-2 text-[13.5px] leading-relaxed text-ink-900 shadow-xs',
        'placeholder:text-ink-400 scroll-polished',
        'transition-[border-color,box-shadow] duration-150 ease-out-quart',
        'border-ink-200 hover:border-ink-300',
        'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12',
        'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
        invalid && 'border-negative focus:border-negative focus:ring-red-500/12',
        className,
      )}
      {...props}
    />
  )
})
