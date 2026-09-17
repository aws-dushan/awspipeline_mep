'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, UserCheck } from 'lucide-react'

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
import type { PipelineRow } from '@/lib/database/enquiry-repository'
import { formatCalendarDate, formatCurrency } from '@/lib/format'

const MIN_REASON = 10

/**
 * Deletion request dialog.
 *
 * Users never delete a pipeline record directly - this raises a request for
 * their supervisor, and the reason is mandatory because it is what the
 * approver actually decides on.
 */
export function DeleteRequestDialog({
  open,
  onOpenChange,
  record,
  currency,
  supervisorName,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: PipelineRow | null
  currency: string
  supervisorName: string | null
  onSubmit: (reason: string) => Promise<boolean>
}) {
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [touched, setTouched] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setReason('')
      setTouched(false)
    }
  }, [open])

  const trimmed = reason.trim()
  const error =
    touched && trimmed.length < MIN_REASON
      ? `Please give at least ${MIN_REASON} characters so your approver understands why.`
      : undefined

  async function submit() {
    setTouched(true)
    if (trimmed.length < MIN_REASON) return
    setSubmitting(true)
    try {
      const succeeded = await onSubmit(trimmed)
      if (succeeded) onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader eyebrow="Approval required">
          <DialogTitle>Request deletion</DialogTitle>
          <DialogDescription>
            The record stays in the pipeline until your approver reviews this request.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {record ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
              className="rounded-lg border border-ink-100 bg-ink-50/60 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-negative-soft text-negative">
                  <ShieldAlert className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink-900">
                    Job {record.jobNo}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-ink-700">{record.customerName}</p>
                  {record.projectName ? (
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
                      {record.projectName}
                    </p>
                  ) : null}

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-400">Enquiry date</dt>
                      <dd className="tabular font-medium text-ink-700">
                        {formatCalendarDate(record.enquiryDate, '—')}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-400">Quote value</dt>
                      <dd className="tabular font-medium text-ink-700">
                        {record.quoteValue === null
                          ? '—'
                          : formatCurrency(record.quoteValue, currency)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </motion.div>
          ) : null}

          <Field
            label="Reason for deletion"
            required
            htmlFor="delete-reason"
            error={error}
            hint={
              error
                ? undefined
                : 'Your approver sees this, and it is stored in the audit history.'
            }
          >
            <Textarea
              id="delete-reason"
              autoFocus
              rows={4}
              value={reason}
              invalid={Boolean(error)}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              />
          </Field>

          <div className="flex items-center gap-2.5 rounded-md bg-brand-50/70 px-3.5 py-2.5">
            <UserCheck className="size-4 shrink-0 text-brand-600" />
            <p className="text-[12.5px] text-brand-800">
              {supervisorName ? (
                <>
                  This will be sent to <span className="font-semibold">{supervisorName}</span> for
                  approval.
                </>
              ) : (
                'This will be sent to an administrator for approval.'
              )}
            </p>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={submitting}
            loadingText="Submitting..."
            disabled={trimmed.length < MIN_REASON && touched}
          >
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </AnimatedDialog>
  )
}
