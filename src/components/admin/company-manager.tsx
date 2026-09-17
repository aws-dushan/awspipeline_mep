'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { Controller, useForm } from 'react-hook-form'
import { Building2, ExternalLink, Pencil, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { AdminPageHeader, AdminShell } from '@/components/admin/admin-page-header'
import { ColorPicker } from '@/components/admin/color-picker'
import { Badge } from '@/components/ui/badge'
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
import { formatNumber } from '@/lib/format'
import { companySchema } from '@/lib/validation/admin'
import { cn, hexWithAlpha, initials } from '@/lib/utils'
import { createCompanyAction, updateCompanyAction } from '@/server/actions/admin-actions'

export type AdminCompany = {
  id: string
  name: string
  color: string
  currency: string
  isActive: boolean
  jobNoPrefix: string
  nextJobNo: number
  userCount: number
  enquiryCount: number
}

const formSchema = companySchema
type FormValues = z.input<typeof formSchema>

export function CompanyManager({ companies }: { companies: AdminCompany[] }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<AdminCompany | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(company: AdminCompany) {
    setEditing(company)
    setDialogOpen(true)
  }

  return (
    <AdminShell>
      <AdminPageHeader
        title="Companies"
        description="Each company keeps its own pipeline, customers, dropdown values and automation rules. Nothing is shared between them."
        actions={
          <Button variant="primary" onClick={openCreate} className="group">
            <Plus className="transition-transform duration-200 group-hover:rotate-90" />
            New company
          </Button>
        }
      />

      {companies.length === 0 ? (
        <EmptyCompanies onCreate={openCreate} />
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {companies.map((company) => (
            <motion.article
              key={company.id}
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 1, 0.5, 1] } },
              }}
              className={cn(
                'group relative overflow-hidden rounded-lg border border-ink-100 bg-white p-5',
                'shadow-xs transition-shadow duration-200 hover:shadow-md',
                !company.isActive && 'opacity-70',
              )}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ backgroundColor: company.color }}
              />

              <div className="flex items-start justify-between gap-3">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-md text-[14px] font-bold"
                  style={{
                    backgroundColor: hexWithAlpha(company.color, 0.13),
                    color: company.color,
                  }}
                >
                  {initials(company.name)}
                </span>

                <div className="flex items-center gap-1.5">
                  {!company.isActive ? (
                    <Badge tone="neutral" size="sm">
                      Inactive
                    </Badge>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={() => openEdit(company)}
                    aria-label={`Edit ${company.name}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Pencil />
                  </Button>
                </div>
              </div>

              <h2 className="mt-4 truncate text-[15.5px] font-semibold tracking-[-0.01em] text-ink-900">
                {company.name}
              </h2>

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3.5">
                <Stat label="Currency" value={company.currency} />
                <Stat label="Next job" value={`${company.jobNoPrefix}${company.nextJobNo}`} />
              </dl>

              <div className="mt-4 flex items-center gap-4 text-[12px] text-ink-500">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-ink-400" />
                  {formatNumber(company.userCount)} {company.userCount === 1 ? 'user' : 'users'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-ink-400" />
                  {formatNumber(company.enquiryCount)}{' '}
                  {company.enquiryCount === 1 ? 'request' : 'requests'}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => router.push(`/c/${company.id}/pipeline`)}
                >
                  Open pipeline
                  <ExternalLink />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/c/${company.id}/admin/dropdowns`)}
                >
                  Settings
                </Button>
              </div>
            </motion.article>
          ))}
        </motion.div>
      )}

      <CompanyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={editing}
        onSaved={() => router.refresh()}
      />
    </AdminShell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate text-[12.5px] font-medium text-ink-800 tabular">{value}</dd>
    </div>
  )
}

function EmptyCompanies({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
      className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-ink-200 bg-white/70 px-8 py-20 text-center"
    >
      <span className="grid size-14 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Building2 className="size-6" />
      </span>
      <div>
        <h2 className="text-[17px] font-semibold text-ink-900">Create your first company</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-500">
          A company gets a starter set of statuses, locations, materials and probabilities, plus
          the default Status and Probability linkage. All of it is editable afterwards.
        </p>
      </div>
      <Button variant="primary" size="lg" onClick={onCreate}>
        <Plus />
        New company
      </Button>
    </motion.div>
  )
}

function CompanyDialog({
  open,
  onOpenChange,
  company,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  company: AdminCompany | null
  onSaved: () => void
}) {
  const isEdit = Boolean(company)

  const defaultValues = React.useMemo<FormValues>(
    () => ({
      name: company?.name ?? '',
      color: company?.color ?? '#302078',
      currency: company?.currency ?? 'AED',
      isActive: company?.isActive ?? true,
      jobNoStart: company?.nextJobNo ?? 1000,
      jobNoPrefix: company?.jobNoPrefix ?? '',
    }),
    [company],
  )

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as never,
    defaultValues,
  })

  React.useEffect(() => {
    if (open) reset(defaultValues)
  }, [open, defaultValues, reset])

  async function submit(values: FormValues) {
    const result = isEdit
      ? await updateCompanyAction({ ...values, companyId: company!.id })
      : await createCompanyAction(values)

    if (!result.ok) {
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof FormValues, { type: 'server', message })
      }
      toast.error(isEdit ? 'Could not save the company' : 'Could not create the company', {
        description: result.error,
      })
      return
    }

    toast.success(isEdit ? 'Company updated' : 'Company created', {
      description: isEdit
        ? undefined
        : 'Starter dropdown values and automation rules have been added.',
    })
    onOpenChange(false)
    onSaved()
  }

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader eyebrow={isEdit ? 'Edit' : 'New'}>
          <DialogTitle>{isEdit ? 'Edit company' : 'Create company'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Changes apply immediately across the pipeline and exports.'
              : 'The company starts with a full set of editable dropdown values.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <Field label="Company name" required error={errors.name?.message}>
              <Input
                autoFocus
                invalid={Boolean(errors.name)}
                {...register('name')}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency" required error={errors.currency?.message}>
                <Input
                  maxLength={3}
                  className="uppercase"
                  invalid={Boolean(errors.currency)}
                  {...register('currency')}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Job number prefix"
                error={errors.jobNoPrefix?.message}
                hint="Optional, e.g. AD-"
              >
                <Input {...register('jobNoPrefix')} />
              </Field>

              <Field
                label={isEdit ? 'Next job number' : 'Start job numbers at'}
                error={errors.jobNoStart?.message}
                hint={isEdit ? 'Read-only once numbers have been issued.' : undefined}
              >
                <Input
                  inputMode="numeric"
                  className="tabular"
                  disabled={isEdit}
                  invalid={Boolean(errors.jobNoStart)}
                  {...register('jobNoStart')}
                />
              </Field>
            </div>

            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <Field
                  label="Accent colour"
                  error={errors.color?.message}
                  hint="Used on company cards and chips."
                >
                  <ColorPicker value={field.value ?? '#302078'} onChange={field.onChange} />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-ink-100 bg-ink-50/60 px-3.5 py-3">
                  <span>
                    <span className="block text-[13px] font-medium text-ink-800">Active</span>
                    <span className="block text-[12px] text-ink-500">
                      Inactive companies disappear from the company picker.
                    </span>
                  </span>
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </label>
              )}
            />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Create company'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
  )
}

export { AnimatePresence }
