'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, History, RefreshCw, Search } from 'lucide-react'
import type { AuditAction } from '@prisma/client'

import { AdminPageHeader, AdminShell } from '@/components/admin/admin-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, Tooltip } from '@/components/ui/primitives'
import { useLiveChannel } from '@/hooks/use-live-channel'
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONE,
  type AuditFeedEntry,
} from '@/lib/audit/labels'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

const TONE_CLASSES: Record<string, string> = {
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  neutral: 'bg-ink-100 text-ink-500',
}

const TONE_BADGE: Record<string, 'positive' | 'negative' | 'warning' | 'info' | 'neutral'> = {
  positive: 'positive',
  negative: 'negative',
  warning: 'warning',
  info: 'info',
  neutral: 'neutral',
}

export type AuditTimelineProps = {
  companyId: string
  entries: (Omit<AuditFeedEntry, 'createdAt'> & { createdAt: string })[]
  actors: { id: string; name: string; avatarColor: string }[]
  currentUserId: string
  selectedAction: AuditAction | 'ALL'
  selectedActor: string | 'ALL'
}

export function AuditTimeline({
  companyId,
  entries,
  actors,
  currentUserId,
  selectedAction,
  selectedActor,
}: AuditTimelineProps) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)

  // New activity should appear without the user reloading the page.
  useLiveChannel(companyId, {
    onEvent: (event) => {
      if (event.actorId === currentUserId) return
      router.refresh()
    },
  })

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return entries
    return entries.filter(
      (entry) =>
        entry.summary.toLowerCase().includes(query) ||
        entry.enquiry?.jobNo.toLowerCase().includes(query) ||
        entry.enquiry?.customerName.toLowerCase().includes(query) ||
        entry.changes.some(
          (change) =>
            change.label.toLowerCase().includes(query) ||
            (change.from ?? '').toLowerCase().includes(query) ||
            (change.to ?? '').toLowerCase().includes(query),
        ),
    )
  }, [entries, search])

  function updateQuery(key: string, value: string) {
    const params = new URLSearchParams(window.location.search)
    if (value === 'ALL') params.delete(key)
    else params.set(key, value)
    router.replace(
      `/c/${companyId}/audit${params.size ? `?${params.toString()}` : ''}`,
      { scroll: false },
    )
  }

  return (
    <AdminShell>
      <AdminPageHeader
        title="Audit history"
        description="Every create, edit, deletion decision and configuration change, with the exact values before and after."
        backHref={`/c/${companyId}/pipeline`}
        backLabel="Back to pipeline"
        actions={
          <Button
            variant="secondary"
            loading={refreshing}
            onClick={() => {
              setRefreshing(true)
              router.refresh()
              window.setTimeout(() => setRefreshing(false), 600)
            }}
          >
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[280px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search job, customer, field..."
            leading={<Search />}
          />
        </div>

        <Select value={selectedAction} onValueChange={(value) => updateQuery('action', value)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All activity</SelectItem>
            {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((action) => (
              <SelectItem key={action} value={action}>
                {AUDIT_ACTION_LABELS[action]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedActor} onValueChange={(value) => updateQuery('actor', value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Anyone</SelectItem>
            {actors.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-[12.5px] text-ink-400 tabular">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-200 bg-white/70 px-6 py-20 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
            <History className="size-5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink-900">No activity recorded</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-500">
              Actions taken in this company will appear here.
            </p>
          </div>
        </div>
      ) : (
        <ol className="relative flex flex-col">
          {/* The spine the timeline hangs from. */}
          <span
            aria-hidden
            className="absolute bottom-4 left-[19px] top-4 w-px bg-ink-100"
          />

          <AnimatePresence initial={false}>
            {filtered.map((entry, index) => {
              const tone = AUDIT_ACTION_TONE[entry.action]
              return (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(index * 0.015, 0.2) }}
                  className="relative flex gap-3 pb-3"
                >
                  <span
                    className={cn(
                      'relative z-10 grid size-10 shrink-0 place-items-center rounded-full ring-4 ring-canvas',
                      TONE_CLASSES[tone],
                    )}
                  >
                    {entry.actor ? (
                      <Avatar name={entry.actor.name} color={entry.actor.avatarColor} size="md" />
                    ) : (
                      <History className="size-4" />
                    )}
                  </span>

                  <div className="panel min-w-0 flex-1 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 text-[13.5px] leading-snug text-ink-800">
                        {entry.summary}
                      </p>
                      <Tooltip content={formatDateTime(entry.createdAt)}>
                        <span className="shrink-0 text-[11.5px] text-ink-400">
                          {formatRelative(entry.createdAt)}
                        </span>
                      </Tooltip>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={TONE_BADGE[tone]} size="sm">
                        {AUDIT_ACTION_LABELS[entry.action]}
                      </Badge>
                      {entry.enquiry ? (
                        <span className="text-[11.5px] text-ink-400">
                          Job{' '}
                          <span className="font-medium text-ink-600 tabular">
                            {entry.enquiry.jobNo}
                          </span>{' '}
                          · {entry.enquiry.customerName}
                        </span>
                      ) : null}
                    </div>

                    {entry.changes.length > 0 ? (
                      <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-ink-100 pt-2.5">
                        {entry.changes.map((change) => (
                          <li
                            key={change.field}
                            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]"
                          >
                            <span className="min-w-[110px] font-medium text-ink-500">
                              {change.label}
                            </span>
                            <span className="rounded bg-negative-soft px-1.5 py-0.5 text-negative line-through decoration-red-300">
                              {change.from ?? 'empty'}
                            </span>
                            <ArrowRight className="size-3 text-ink-300" />
                            <span className="rounded bg-positive-soft px-1.5 py-0.5 font-medium text-positive">
                              {change.to ?? 'empty'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {typeof entry.metadata?.reason === 'string' ? (
                      <p className="mt-2 rounded-sm bg-ink-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-ink-600">
                        <span className="font-medium text-ink-500">Reason:</span>{' '}
                        {entry.metadata.reason}
                      </p>
                    ) : null}
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>
      )}
    </AdminShell>
  )
}
