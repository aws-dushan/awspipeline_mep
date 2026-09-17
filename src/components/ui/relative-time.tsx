'use client'

import * as React from 'react'

import { formatRelative } from '@/lib/format'

/**
 * A "3 minutes ago" label that survives hydration.
 *
 * `formatRelative` is a function of the current time, so the server renders
 * one answer and the browser - a round trip later, on a different clock -
 * renders another. React calls that a text mismatch and throws #418, which in
 * production is a minified error with no clue in it. Over a fast local
 * connection the two usually agree and the bug stays hidden; over the
 * internet it does not.
 *
 * So the first paint is allowed to differ, and the label is recomputed on
 * mount against the reader's own clock. It then refreshes every minute, which
 * is the smallest unit it reports.
 */
export function RelativeTime({
  value,
  className,
}: {
  value: Date | string | null | undefined
  className?: string
}) {
  const [, tick] = React.useReducer((n: number) => n + 1, 0)

  React.useEffect(() => {
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className={className} suppressHydrationWarning>
      {formatRelative(value)}
    </span>
  )
}
