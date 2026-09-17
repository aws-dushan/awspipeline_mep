'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { motion } from 'framer-motion'
import { Check, Minus } from 'lucide-react'

import { cn, hexWithAlpha, initials } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Checkbox                                                                  */
/* -------------------------------------------------------------------------- */

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentProps<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer grid size-[17px] shrink-0 place-items-center rounded-[5px] border border-ink-300 bg-white',
        'transition-all duration-150 ease-out-quart',
        'hover:border-brand-400',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15',
        'data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600',
        'data-[state=indeterminate]:border-brand-600 data-[state=indeterminate]:bg-brand-600',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-white">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.14, ease: [0.34, 1.56, 0.64, 1] }}
            className="grid place-items-center"
          >
            <Check className="size-3" strokeWidth={3.2} />
          </motion.span>
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})

/**
 * Checkbox appearance with no interactive element behind it.
 *
 * For rows that are themselves a button or a menu item: nesting the real
 * Radix checkbox (which renders a `<button>`) inside another button is invalid
 * HTML and breaks hydration. The parent already owns the click, so the tick
 * only has to be drawn.
 */
export function CheckboxVisual({
  checked,
  className,
}: {
  checked: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[17px] shrink-0 place-items-center rounded-[5px] border transition-all duration-150 ease-out-quart',
        checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 bg-white',
        className,
      )}
    >
      {checked ? (
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.14, ease: [0.34, 1.56, 0.64, 1] }}
          className="grid place-items-center"
        >
          <Check className="size-3" strokeWidth={3.2} />
        </motion.span>
      ) : null}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Switch                                                                    */
/* -------------------------------------------------------------------------- */

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentProps<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-out-quart',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15',
        'data-[state=checked]:bg-brand-600 data-[state=unchecked]:bg-ink-200',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-[18px] rounded-full bg-white shadow-sm ring-0',
          'transition-transform duration-200 ease-spring',
          'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
})

/* -------------------------------------------------------------------------- */
/*  Separator                                                                 */
/* -------------------------------------------------------------------------- */

export const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentProps<typeof SeparatorPrimitive.Root>
>(function Separator({ className, orientation = 'horizontal', decorative = true, ...props }, ref) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-ink-100',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
})

/* -------------------------------------------------------------------------- */
/*  Tooltip                                                                   */
/* -------------------------------------------------------------------------- */

export const TooltipProvider = TooltipPrimitive.Provider
export const TooltipRoot = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentProps<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-[320px] rounded-md bg-ink-900 px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg',
          'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})

/** Shorthand for the common "hover a control, read a sentence" case. */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delay = 250,
  className,
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delay?: number
  className?: string
}) {
  if (!content) return <>{children}</>
  return (
    <TooltipRoot delayDuration={delay}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={className}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  )
}

/* -------------------------------------------------------------------------- */
/*  Avatar                                                                    */
/* -------------------------------------------------------------------------- */

export function Avatar({
  name,
  color = '#1E4FD8',
  size = 'md',
  src,
  className,
}: {
  name: string
  color?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  src?: string | null
  className?: string
}) {
  const sizes = {
    xs: 'size-5 text-[9.5px]',
    sm: 'size-6 text-[10.5px]',
    md: 'size-8 text-[12px]',
    lg: 'size-11 text-[15px]',
  }

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: hexWithAlpha(color, 0.14), color }}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback delayMs={src ? 300 : 0} className="select-none leading-none">
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                      */
/* -------------------------------------------------------------------------- */

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentProps<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex h-9 items-center gap-0.5 rounded-lg bg-ink-100 p-1 text-ink-500',
        className,
      )}
      {...props}
    />
  )
})

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentProps<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium',
        'transition-all duration-150 ease-out-quart',
        'hover:text-ink-800',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15',
        'data-[state=active]:bg-white data-[state=active]:text-ink-900 data-[state=active]:shadow-xs',
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  )
})

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentProps<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('focus-visible:outline-none', className)}
      {...props}
    />
  )
})

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                  */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('skeleton', className)} {...props} />
}

/* -------------------------------------------------------------------------- */
/*  Spinner                                                                   */
/* -------------------------------------------------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600',
        className,
      )}
    />
  )
}
