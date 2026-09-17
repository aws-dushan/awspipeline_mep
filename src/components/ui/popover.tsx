'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

/**
 * Animated popover used by every column filter menu.
 *
 * The enter/exit movement is CSS driven off Radix's `data-state` (see
 * `.radix-pop` in globals.css) rather than JS: that is the only way the exit
 * animation can finish before React unmounts the node, and it keeps the whole
 * transition on the compositor.
 */
const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentProps<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'radix-pop z-50 rounded-lg border border-ink-100 bg-white p-1.5 shadow-lg',
          'focus:outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
