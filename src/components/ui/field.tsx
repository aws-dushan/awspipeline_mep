'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }
>(function Label({ className, children, required, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-[12.5px] font-medium leading-none text-ink-600 select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-negative" aria-hidden>
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  )
})

export type FieldProps = {
  label?: React.ReactNode
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
  /** Puts the label and control side by side (used in dense settings forms). */
  inline?: boolean
}

/**
 * Wraps a control with its label, hint and validation message.
 *
 * The error slides in rather than appearing instantly, and the layout reserves
 * no space for it, so a form does not jump on first render but does animate
 * when a message arrives.
 */
export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
  inline,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', inline && 'sm:flex-row sm:items-center sm:gap-4', className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required} className={cn(inline && 'sm:w-40 sm:shrink-0')}>
          {label}
        </Label>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {children}

        <AnimatePresence initial={false} mode="wait">
          {error ? (
            <motion.p
              key="error"
              role="alert"
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
              className="flex items-start gap-1.5 text-[12px] font-medium text-negative"
            >
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </motion.p>
          ) : hint ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[12px] text-ink-400"
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
