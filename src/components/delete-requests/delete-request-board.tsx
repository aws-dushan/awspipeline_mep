'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  Clock3,
  Inbox,
  MessageSquare,
  ShieldCheck,
  Undo2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DeleteRequestStatus } from '@prisma/client'

import { AdminPageHeader, AdminShell } from '@/components/admin/admin-page-header'
import { Badge, ValueBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AnimatedDialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { Avatar, Tabs, TabsList, TabsTrigger, Tooltip } from '@/components/ui/primitives'
import { useLiveChannel } from '@/hooks/use-live-channel'
import { RelativeTime } from '@/components/ui/relative-time'
import { formatCalendarDate, formatCurrency, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DeleteRequestListItem } from '@/server/actions/delete-request-actions'
import {
  cancelDeleteRequestAction,
} from '@/server/actions/enquiry-actions'
import { decideDeleteRequestAction } from '@/server/actions/delete-request-actions'

const STATUS_META: Record<
  DeleteRequestStatus,
  { label: string; tone: 'warning' | 'negative' | 'neutral'; icon: typeof Clock3 }
> = {
  PENDING: { label: 'Awaiting approval', tone: 'warning', icon: Clock3 },
  APPROVED: { label: 'Approved', tone: 'negative', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', tone: 'neutral', icon: XCircle },
}

export function DeleteRequestBoard({
  companyId,
  currency,
  currentUserId,
  requests,
  initialStatus,
  canReview,
}: {
  companyId: string
  currency: string
  currentUserId: string
  requests: DeleteRequestListItem[]
  initialStatus: DeleteRequestStatus | 'ALL'
  canReview: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = React.useState<DeleteRequestStatus | 'ALL'>(initialStatus)
  const [decision, setDecision] = React.useState<{
    request: DeleteRequestListItem
    outcome: 'APPROVED' | 'REJECTED'
  } | null>(null)

  // Keep the queue current: a supervisor sitting on this screen sees new
  // requests arrive without refreshing.
  useLiveChannel(companyId, {
    channels: ['delete-requests'],
    onEvent: (event) => {
      if (event.actorId === currentUserId) return
      router.refresh()
    },
  })

  function changeStatus(next: DeleteRequestStatus | 'ALL') {
    setStatus(next)
    const params = new URLSearchParams()
    if (next !== 'PENDING') params.set('status', next)
    router.replace(`/c/${companyId}/delete-requests${params.size ? `?${params}` : ''}`, {
      scroll: false,
    })
  }

  const pendingCount = requests.filter((request) => request.status === 'PENDING').length

  return (
    <AdminShell>
      <AdminPageHeader
        title="Delete requests"
        description={
          canReview
            ? 'Approving performs a soft delete: the record leaves the pipeline and every export, but stays in the database with its full history.'
            : 'Requests you have submitted. Your supervisor decides whether the record is removed.'
        }
        backHref={`/c/${companyId}/pipeline`}
        backLabel="Back to pipeline"
        actions={
          pendingCount > 0 ? (
            <Badge tone="warning" size="lg">
              <Clock3 className="size-3.5" />
              {pendingCount} awaiting {pendingCount === 1 ? 'decision' : 'decisions'}
            </Badge>
          ) : null
        }
      />

      <Tabs value={status} onValueChange={(value) => changeStatus(value as DeleteRequestStatus)}>
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {requests.length === 0 ? (
        <EmptyQueue status={status} canReview={canReview} />
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="flex flex-col gap-3"
        >
          <AnimatePresence initial={false}>
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                currency={currency}
                isOwn={request.requestedBy.id === currentUserId}
                onDecide={(outcome) => setDecision({ request, outcome })}
                onWithdraw={async () => {
                  const result = await cancelDeleteRequestAction({
                    companyId,
                    requestId: request.id,
                  })
                  if (!result.ok) {
                    toast.error('Could not withdraw the request', { description: result.error })
                    return
                  }
                  toast.success('Deletion request withdrawn')
                  router.refresh()
                }}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <DecisionDialog
        companyId={companyId}
        decision={decision}
        onOpenChange={(open) => !open && setDecision(null)}
        onDecided={() => router.refresh()}
      />
    </AdminShell>
  )
}

function RequestCard({
  request,
  currency,
  isOwn,
  onDecide,
  onWithdraw,
}: {
  request: DeleteRequestListItem
  currency: string
  isOwn: boolean
  onDecide: (outcome: 'APPROVED' | 'REJECTED') => void
  onWithdraw: () => Promise<void>
}) {
  const [withdrawing, setWithdrawing] = React.useState(false)
  const meta = STATUS_META[request.status]
  const StatusIcon = meta.icon

  return (
    <motion.article
      layout
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.25, 1, 0.5, 1] } },
      }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={cn(
        'panel overflow-hidden transition-shadow duration-200 hover:shadow-md',
        request.status === 'PENDING' && 'border-l-[3px] border-l-warning',
        request.status === 'APPROVED' && 'border-l-[3px] border-l-negative',
        request.status === 'REJECTED' && 'opacity-80',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4 p-4">
        {/* --- Record --------------------------------------------------- */}
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-ink-900 tabular">
              Job {request.enquiry.jobNo}
            </span>
            {request.enquiry.status ? (
              <ValueBadge
                label={request.enquiry.status.label}
                color={request.enquiry.status.color}
                size="sm"
              />
            ) : null}
            {request.enquiry.isDeleted ? (
              <Badge tone="negative" size="sm">
                Deleted
              </Badge>
            ) : null}
          </div>

          <p className="mt-1 truncate text-[13.5px] font-medium text-ink-800">
            {request.enquiry.customerName}
          </p>
          {request.enquiry.projectName ? (
            <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
              {request.enquiry.projectName}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-500">
            <span>
              Enquiry{' '}
              <span className="font-medium text-ink-700 tabular">
                {formatCalendarDate(request.enquiry.enquiryDate, '—')}
              </span>
            </span>
            {request.enquiry.quoteValue !== null ? (
              <span>
                Quote{' '}
                <span className="font-medium text-ink-700 tabular">
                  {formatCurrency(request.enquiry.quoteValue, currency)}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        {/* --- Reason --------------------------------------------------- */}
        <div className="min-w-[240px] flex-[1.4]">
          <div className="flex items-center gap-2">
            <Avatar
              name={request.requestedBy.name}
              color={request.requestedBy.avatarColor}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink-800">
                {request.requestedBy.name}
                {isOwn ? <span className="ml-1.5 text-ink-400">(you)</span> : null}
              </p>
              <Tooltip content={formatDateTime(request.requestedAt)}>
                <p className="text-[11.5px] text-ink-400">
                  <RelativeTime value={request.requestedAt} />
                </p>
              </Tooltip>
            </div>
          </div>

          <blockquote className="mt-2.5 rounded-md bg-ink-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700">
            {request.reason}
          </blockquote>

          {request.decisionNote ? (
            <div className="mt-2 flex items-start gap-2 px-1 text-[12px] text-ink-500">
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
              <span>
                <span className="font-medium text-ink-700">
                  {request.decidedBy?.name ?? 'Reviewer'}:
                </span>{' '}
                {request.decisionNote}
              </span>
            </div>
          ) : null}
        </div>

        {/* --- Status & actions ----------------------------------------- */}
        <div className="flex min-w-[180px] flex-col items-start gap-3">
          <Badge tone={meta.tone} size="md">
            <StatusIcon className="size-3.5" />
            {meta.label}
          </Badge>

          {request.status === 'PENDING' ? (
            request.canDecide ? (
              <div className="flex items-center gap-2">
                <Button variant="positive" size="sm" onClick={() => onDecide('APPROVED')}>
                  <CheckCircle2 />
                  Approve
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onDecide('REJECTED')}>
                  <XCircle />
                  Reject
                </Button>
              </div>
            ) : isOwn ? (
              <Button
                variant="ghost"
                size="sm"
                loading={withdrawing}
                onClick={async () => {
                  setWithdrawing(true)
                  await onWithdraw()
                  setWithdrawing(false)
                }}
              >
                <Undo2 />
                Withdraw
              </Button>
            ) : (
              <p className="text-[12px] text-ink-400">
                {request.supervisor
                  ? `Waiting on ${request.supervisor.name}`
                  : 'Waiting on an administrator'}
              </p>
            )
          ) : (
            <p className="text-[12px] text-ink-400">
              {request.decidedBy ? `By ${request.decidedBy.name}` : ''}
              {request.decidedAt ? (
                <>
                  {' · '}
                  <RelativeTime value={request.decidedAt} />
                </>
              ) : null}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  )
}

function EmptyQueue({
  status,
  canReview,
}: {
  status: DeleteRequestStatus | 'ALL'
  canReview: boolean
}) {
  const copy: Record<string, { title: string; body: string }> = {
    PENDING: {
      title: 'Nothing waiting',
      body: canReview
        ? 'No deletion requests need your decision right now.'
        : 'You have no deletion requests awaiting approval.',
    },
    APPROVED: { title: 'No approved requests', body: 'Nothing has been approved for deletion yet.' },
    REJECTED: { title: 'No rejected requests', body: 'No deletion request has been turned down.' },
    ALL: { title: 'No requests yet', body: 'Deletion requests will appear here once raised.' },
  }
  const { title, body } = copy[status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-200 bg-white/70 px-6 py-20 text-center"
    >
      <span className="grid size-12 place-items-center rounded-xl bg-positive-soft text-positive">
        {status === 'PENDING' ? <ShieldCheck className="size-5" /> : <Inbox className="size-5" />}
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink-900">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-500">{body}</p>
      </div>
    </motion.div>
  )
}

function DecisionDialog({
  companyId,
  decision,
  onOpenChange,
  onDecided,
}: {
  companyId: string
  decision: { request: DeleteRequestListItem; outcome: 'APPROVED' | 'REJECTED' } | null
  onOpenChange: (open: boolean) => void
  onDecided: () => void
}) {
  const [note, setNote] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (decision) setNote('')
  }, [decision])

  const approving = decision?.outcome === 'APPROVED'

  async function submit() {
    if (!decision) return
    setSubmitting(true)

    const result = await decideDeleteRequestAction({
      companyId,
      requestId: decision.request.id,
      decision: decision.outcome,
      note,
    })
    setSubmitting(false)

    if (!result.ok) {
      toast.error('Could not record the decision', { description: result.error })
      return
    }

    toast.success(approving ? 'Deletion approved' : 'Deletion rejected', {
      description: approving
        ? `Job ${result.data.jobNo} has been removed from the pipeline. The record is retained for audit.`
        : `Job ${result.data.jobNo} stays in the pipeline.`,
    })
    onOpenChange(false)
    onDecided()
  }

  return (
    <AnimatedDialog open={decision !== null} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader eyebrow={decision ? `Job ${decision.request.enquiry.jobNo}` : undefined}>
          <DialogTitle>{approving ? 'Approve deletion' : 'Reject deletion'}</DialogTitle>
          <DialogDescription>
            {approving
              ? 'The record will disappear from the pipeline, searches and exports. It stays in the database permanently for audit.'
              : 'The record stays in the pipeline and the requester is told it was rejected.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {decision ? (
            <div className="rounded-md border border-ink-100 bg-ink-50/60 px-3.5 py-3">
              <p className="truncate text-[13px] font-medium text-ink-800">
                {decision.request.enquiry.customerName}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">
                <span className="font-medium text-ink-600">
                  {decision.request.requestedBy.name}:
                </span>{' '}
                {decision.request.reason}
              </p>
            </div>
          ) : null}

          <Field
            label={approving ? 'Note (optional)' : 'Reason for rejecting (optional)'}
            hint="Stored in the audit history and shown to the requester."
          >
            <Textarea
              autoFocus
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={approving ? 'danger' : 'primary'}
            onClick={submit}
            loading={submitting}
            loadingText="Saving..."
          >
            {approving ? 'Approve deletion' : 'Reject request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </AnimatedDialog>
  )
}
