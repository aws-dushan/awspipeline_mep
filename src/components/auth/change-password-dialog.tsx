'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

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
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { Input } from '@/components/ui/input'
import { assessPassword } from '@/lib/auth/password'
import { cn } from '@/lib/utils'
import { changePasswordSchema } from '@/lib/validation/auth'
import { changeOwnPasswordAction } from '@/server/actions/account-actions'

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent']
const STRENGTH_COLORS = [
  'bg-negative',
  'bg-negative',
  'bg-warning',
  'bg-brand-500',
  'bg-positive',
]

/** Lets any signed-in user change their own password. */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!open) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShow(false)
    setFormError(null)
    setErrors({})
  }, [open])

  const strength = React.useMemo(() => assessPassword(newPassword), [newPassword])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setErrors({})

    // Validate locally first so the rules are stated before a round trip.
    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form'
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      setFormError('Please correct the fields below.')
      return
    }

    setSubmitting(true)
    const result = await changeOwnPasswordAction(parsed.data)
    setSubmitting(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      setFormError(result.error)
      return
    }

    toast.success('Password changed', {
      description:
        result.data.otherSessionsEnded > 0
          ? `You were signed out of ${result.data.otherSessionsEnded} other ${
              result.data.otherSessionsEnded === 1 ? 'session' : 'sessions'
            }.`
          : 'Use your new password next time you sign in.',
    })
    onOpenChange(false)
  }

  const reveal = (
    <button
      type="button"
      onClick={() => setShow((value) => !value)}
      aria-label={show ? 'Hide passwords' : 'Show passwords'}
      className="grid size-6 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
    >
      {show ? <EyeOff /> : <Eye />}
    </button>
  )

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader eyebrow="Account">
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            You will stay signed in here. Any other device signed in as you will be signed out.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorSummary
              message={formError}
              fieldErrors={errors}
              labels={{
                currentPassword: 'Current password',
                newPassword: 'New password',
                confirmPassword: 'Confirm password',
              }}
            />

            <Field label="Current password" required error={errors.currentPassword}>
              <Input
                autoFocus
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                invalid={Boolean(errors.currentPassword)}
                trailing={reveal}
              />
            </Field>

            <Field
              label="New password"
              required
              error={errors.newPassword}
              hint="At least 8 characters, with an uppercase letter and a number."
            >
              <Input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                invalid={Boolean(errors.newPassword)}
              />
            </Field>

            {newPassword ? (
              <div className="flex items-center gap-2.5">
                <span className="flex h-1 flex-1 gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-full flex-1 rounded-full transition-colors duration-200',
                        index < strength.score ? STRENGTH_COLORS[strength.score] : 'bg-ink-100',
                      )}
                    />
                  ))}
                </span>
                <span className="w-20 shrink-0 text-right text-[11.5px] font-medium text-ink-500">
                  {STRENGTH_LABELS[strength.score]}
                </span>
              </div>
            ) : null}

            <Field label="Confirm new password" required error={errors.confirmPassword}>
              <Input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                invalid={Boolean(errors.confirmPassword)}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
  )
}
