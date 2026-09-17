import { Skeleton } from '@/components/ui/primitives'

/**
 * Route-level loading states.
 *
 * These back the `loading.tsx` files, which is what makes navigation feel
 * immediate: Next streams the skeleton the moment a link is clicked instead of
 * holding the old screen while the server renders. It also lets the router
 * prefetch these dynamic routes.
 */

export function PageHeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-80" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-32 rounded-md" />
        ))}
      </div>
    </div>
  )
}

export function PipelineSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:px-5">
      <PageHeaderSkeleton actions={2} />

      <div className="flex items-center gap-6 rounded-lg border border-ink-100 bg-white px-4 py-3">
        {['Pipeline value', 'Weighted value', 'Requests'].map((label) => (
          <div key={label} className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="flex h-10 items-center gap-6 border-b border-ink-100 bg-ink-50/80 px-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-20 shrink-0" />
          ))}
        </div>
        {Array.from({ length: 12 }).map((_, row) => (
          <div
            key={row}
            className="flex h-[46px] items-center gap-6 border-b border-ink-100/70 px-3"
          >
            {Array.from({ length: 9 }).map((_, cell) => (
              <Skeleton
                key={cell}
                className="h-3.5 shrink-0"
                style={{
                  width: [40, 56, 80, 96, 140, 120, 72, 88, 104][cell],
                  animationDelay: `${(row % 4) * 0.12}s`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 6, actions = 1 }: { rows?: number; actions?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-4 sm:p-6">
      <PageHeaderSkeleton actions={actions} />
      <Skeleton className="h-9 w-72 rounded-md" />
      <div className="overflow-hidden rounded-lg border border-ink-100 bg-white">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-ink-100 px-4 py-3.5 last:border-0"
          >
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-52" style={{ animationDelay: `${index * 0.07}s` }} />
              <Skeleton className="h-3 w-72" style={{ animationDelay: `${index * 0.07}s` }} />
            </div>
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-4 sm:p-6">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col gap-4 rounded-lg border border-ink-100 bg-white p-5"
          >
            <Skeleton className="size-11 rounded-md" />
            <Skeleton className="h-4 w-40" style={{ animationDelay: `${index * 0.06}s` }} />
            <Skeleton className="h-3 w-28" style={{ animationDelay: `${index * 0.06}s` }} />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 flex-1 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
