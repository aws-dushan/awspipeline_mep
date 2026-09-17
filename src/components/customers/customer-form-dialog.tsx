'use client'

import * as React from 'react'
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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { createCustomerAction, updateCustomerAction } from '@/server/actions/enquiry-actions'

export type CustomerDraft = {
  id?: string
  name: string
  email: string | null
  phone: string | null
  isActive?: boolean
}

/**
 * One dialog for creating and editing a customer.
 *
 * Shared by the customers screen and the inline "add customer" flow in the
 * enquiry drawer, so contact details can be captured wherever a customer is
 * first entered rather than only from the directory.
 */
export function CustomerFormDialog({
  companyId,
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  companyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass `{ name }` alone to prefill a new customer from a typed search. */
  customer: CustomerDraft | null
  onSaved: (customer: { id: string; name: string; email: string | null; phone: string | null }) => void
}) {
  const isEdit = Boolean(customer?.id)

  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [isActive, setIsActive] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!open) return
    setName(customer?.name ?? '')
    setEmail(customer?.email ?? '')
    setPhone(customer?.phone ?? '')
    setIsActive(customer?.isActive ?? true)
    setErrors({})
  }, [open, customer])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})

    const result =
      isEdit && customer?.id
        ? await updateCustomerAction({
            companyId,
            customerId: customer.id,
            name,
            email,
            phone,
            isActive,
          })
        : await createCustomerAction({ companyId, name, email, phone })

    setSubmitting(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? { name: result.error })
      if (!result.fieldErrors) {
        toast.error(isEdit ? 'Could not save the customer' : 'Could not add the customer', {
          description: result.error,
        })
      }
      return
    }

    const saved = result.data as {
      id: string
      name: string
      renamedEnquiries?: number
    }
    const renamedCount = saved.renamedEnquiries ?? 0

    if (renamedCount > 0) {
      toast.success(`${saved.name} updated`, {
        description: `The new name was applied to ${renamedCount} ${
          renamedCount === 1 ? 'request' : 'requests'
        }.`,
      })
    } else {
      toast.success(isEdit ? `${saved.name} updated` : `${saved.name} added`)
    }

    onOpenChange(false)
    onSaved({
      id: saved.id,
      name: saved.name,
      email: email.trim() || null,
      phone: phone.trim() || null,
    })
  }

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader eyebrow="Customer">
          <DialogTitle>{isEdit ? 'Edit customer' : 'New customer'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Renaming a customer updates the name on all of their requests.'
              : 'Available immediately in the enquiry form for this company.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <Field label="Customer name" required error={errors.name}>
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                invalid={Boolean(errors.name)}
                maxLength={200}
              />
            </Field>

            <Field
              label="Email"
              error={errors.email}
              hint="Prefilled onto new requests for this customer."
            >
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="off"
                invalid={Boolean(errors.email)}
              />
            </Field>

            <Field label="Phone" error={errors.phone}>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={60}
              />
            </Field>

            {isEdit ? (
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-ink-100 bg-ink-50/60 px-3.5 py-3">
                <span>
                  <span className="block text-[13px] font-medium text-ink-800">Active</span>
                  <span className="block text-[12px] text-ink-500">
                    Inactive customers stay on existing requests but cannot be picked.
                  </span>
                </span>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </label>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {isEdit ? 'Save changes' : 'Add customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
  )
}
