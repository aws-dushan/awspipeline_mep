'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // `active:translate-y-px` is the whole micro-interaction: a button that
  // physically depresses reads as responsive without costing a frame.
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all duration-150 ease-out-quart active:translate-y-px disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-brand active:bg-brand-800',
        secondary:
          'bg-white text-ink-700 border border-ink-200 shadow-xs hover:bg-ink-50 hover:border-ink-300 hover:text-ink-900',
        ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
        subtle: 'bg-ink-100 text-ink-700 hover:bg-ink-200 hover:text-ink-900',
        danger:
          'bg-negative text-white shadow-sm hover:brightness-110 active:brightness-95',
        dangerGhost:
          'text-negative hover:bg-negative-soft border border-transparent hover:border-red-200',
        positive:
          'bg-positive text-white shadow-sm hover:brightness-110 active:brightness-95',
        link: 'text-brand-600 underline-offset-4 hover:underline active:translate-y-0',
      },
      size: {
        xs: 'h-7 px-2.5 text-[12px] [&_svg]:size-3.5',
        sm: 'h-8 px-3 text-[13px] [&_svg]:size-4',
        md: 'h-9 px-3.5 text-[13.5px] [&_svg]:size-4',
        lg: 'h-11 px-5 text-[14.5px] [&_svg]:size-[18px]',
        icon: 'size-9 [&_svg]:size-4',
        iconSm: 'size-8 [&_svg]:size-4',
        iconXs: 'size-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
    /** Replaces the label while `loading` is true. */
    loadingText?: string
  }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, loadingText, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  if (asChild) {
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Comp>
    )
  }

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
})

export { buttonVariants }
