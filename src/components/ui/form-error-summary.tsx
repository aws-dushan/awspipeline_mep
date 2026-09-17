'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Form-level error banner.
 *
 * A message attached to one field is easy to miss when the control is a
 * multi-select in a scrolling dialog - the user just sees "nothing happened".
 * This states what is wrong at the top of the form, where the submit failure
 * actually registers.
 */
export function FormErrorSummary({
  message,
  fieldErrors,
  labels,
  className,
}: {
  /** Overall failure message, when there is one. */
  message?: string | null
  /** Field name -> message, as returned by the server action. */
  fieldErrors?: Record<string, string> | null
  /** Field name -> human label, so the list does not read as code. */
  labels?: Record<string, string>
  className?: string
}) {
  const entries = Object.entries(fieldErrors ?? {})
  const visible = Boolean(message) || entries.length > 0

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className={cn('overflow-hidden', className)}
        >
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-red-200 bg-negative-soft px-3.5 py-3"
          >
            <TriangleAlert className="mt-px size-4 shrink-0 text-negative" />
            <div className="min-w-0 flex-1">
              {message ? (
                <p className="text-[12.5px] font-medium leading-relaxed text-red-800">{message}</p>
              ) : null}

              {entries.length > 0 ? (
                <ul
                  className={cn(
                    'flex flex-col gap-0.5 text-[12.5px] leading-relaxed text-red-800',
                    message && 'mt-1.5',
                  )}
                >
                  {entries.map(([field, text]) => (
                    <li key={field} className="flex gap-1.5">
                      <span aria-hidden className="text-red-400">
                        •
                      </span>
                      <span>
                        {labels?.[field] ? (
                          <span className="font-medium">{labels[field]}: </span>
                        ) : null}
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
