'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LiveStatus } from '@/hooks/use-live-channel'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAGE_SIZES = [25, 50, 100, 200]

export function PipelinePagination({
  page,
  pageCount,
  pageSize,
  total,
  liveStatus,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  liveStatus: LiveStatus
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-[12.5px] text-ink-500">
        {total === 0 ? (
          'No rows'
        ) : (
          <>
            Showing{' '}
            <span className="font-medium text-ink-700 tabular">
              {formatNumber(first)}–{formatNumber(last)}
            </span>{' '}
            of <span className="font-medium text-ink-700 tabular">{formatNumber(total)}</span>
          </>
        )}
        <span
          className={cn(
            'ml-2.5 hidden text-[11.5px] sm:inline',
            liveStatus === 'live' ? 'text-positive' : 'text-ink-400',
          )}
        >
          {liveStatus === 'live'
            ? '· updating live'
            : liveStatus === 'connecting'
              ? '· connecting'
              : '· auto-refreshing'}
        </span>
      </p>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-[12.5px] text-ink-400">Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[74px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="iconSm"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="secondary"
            size="iconSm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>

          <span className="px-2 text-[12.5px] text-ink-600 tabular">
            {page} / {pageCount}
          </span>

          <Button
            variant="secondary"
            size="iconSm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
          <Button
            variant="secondary"
            size="iconSm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(pageCount)}
            aria-label="Last page"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
