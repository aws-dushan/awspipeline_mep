'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn, hexWithAlpha, readableForeground } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-150 max-w-full',
  {
    variants: {
      tone: {
        neutral: 'bg-ink-100 text-ink-600',
        brand: 'bg-brand-50 text-brand-700',
        positive: 'bg-positive-soft text-positive',
        warning: 'bg-warning-soft text-warning',
        negative: 'bg-negative-soft text-negative',
        info: 'bg-info-soft text-info',
        outline: 'border border-ink-200 bg-white text-ink-600',
      },
      size: {
        sm: 'h-5 px-2 text-[11px]',
        md: 'h-6 px-2.5 text-[12px]',
        lg: 'h-7 px-3 text-[12.5px]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
}

export type ValueBadgeProps = {
  label: string
  /** Admin-chosen hex. Null falls back to a neutral badge. */
  color?: string | null
  /** Retired values render muted with a dotted outline. */
  inactive?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Solid fill instead of a soft tint - used for the status column. */
  solid?: boolean
}

/**
 * Badge for an admin-configured dropdown value.
 *
 * The colour comes from the database, so the foreground is computed from its
 * luminance: whatever hex an admin picks, the label stays readable.
 */
export function ValueBadge({
  label,
  color,
  inactive,
  size = 'md',
  className,
  solid,
}: ValueBadgeProps) {
  if (!color) {
    return (
      <Badge
        tone={inactive ? 'outline' : 'neutral'}
        size={size}
        className={cn(inactive && 'border-dashed text-ink-400', 'truncate', className)}
      >
        <span className="truncate">{label}</span>
      </Badge>
    )
  }

  const style: React.CSSProperties = solid
    ? { backgroundColor: color, color: readableForeground(color) }
    : {
        backgroundColor: hexWithAlpha(color, inactive ? 0.07 : 0.13),
        color,
        boxShadow: `inset 0 0 0 1px ${hexWithAlpha(color, inactive ? 0.18 : 0.22)}`,
      }

  return (
    <span
      className={cn(
        badgeVariants({ size }),
        'bg-transparent',
        inactive && 'opacity-65',
        'truncate',
        className,
      )}
      style={style}
    >
      {!solid ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

