import { Skeleton } from '@/components/ui/primitives'

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
      </div>
      <div className="flex gap-5">
        <Skeleton className="h-[1000px] max-w-[880px] flex-1 rounded-sm" />
        <Skeleton className="hidden h-80 w-72 rounded-lg xl:block" />
      </div>
    </div>
  )
}
