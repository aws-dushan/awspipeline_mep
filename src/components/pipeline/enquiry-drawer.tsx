'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { Controller, useForm } from 'react-hook-form'
import { Building2, Sparkles, Wand2 } from 'lucide-react'
import type { DropdownTypeKey } from '@prisma/client'

import {
  CustomerFormDialog,
  type CustomerDraft,
} from '@/components/customers/customer-form-dialog'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { DatePicker } from '@/components/ui/date-picker'
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
import { Input, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/primitives'
import type { PipelineRow } from '@/lib/database/enquiry-repository'
import { enquiryToFormValues } from '@/lib/pipeline/enquiry-draft'
import { toISODate } from '@/lib/format'
import { applyAutomationRules, type AutomationRule } from '@/lib/pipeline/automation'
import { cn } from '@/lib/utils'
import {
  enquiryFormSchema,
  EMPTY_ENQUIRY_FORM,
  type EnquiryFormInput,
} from '@/lib/validation/enquiry'

export type DrawerOption = ComboboxOption

export type EnquiryDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  currency: string
  /** Null means "create". */
  record: PipelineRow | null
  options: {
    status: DrawerOption[]
    location: DrawerOption[]
    material: DrawerOption[]
    probability: DrawerOption[]
    users: DrawerOption[]
    customers: DrawerOption[]
  }
  automationRules: AutomationRule[]
  defaultSalesResponsibleId?: string | null
  onSubmit: (values: EnquiryFormInput) => Promise<{ ok: boolean; fieldErrors?: Record<string, string> }>
  onCustomerCreated: () => void
}

const EASE = [0.25, 1, 0.5, 1] as const

export function EnquiryDrawer({
  open,
  onOpenChange,
  companyId,
  currency,
  record,
  options,
  automationRules,
  defaultSalesResponsibleId,
  onSubmit,
  onCustomerCreated,
}: EnquiryDrawerProps) {
  const isEdit = Boolean(record)
  const [automationNote, setAutomationNote] = React.useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  const defaultValues = React.useMemo<EnquiryFormInput>(() => {
    if (!record) {
      return {
        ...EMPTY_ENQUIRY_FORM,
        enquiryDate: toISODate(new Date()) ?? '',
        salesResponsibleId: defaultSalesResponsibleId ?? '',
        statusValueId: options.status[0]?.value ?? '',
      }
    }
    return enquiryToFormValues(record)
    // `options` is intentionally excluded: re-deriving defaults when the
    // catalogue refreshes would discard what the user has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, defaultSalesResponsibleId])

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EnquiryFormInput>({
    resolver: zodResolver(enquiryFormSchema) as never,
    defaultValues,
    mode: 'onBlur',
  })

  /**
   * The contact details last put there by a customer selection.
   *
   * Email and phone are prefilled from the chosen customer, but they belong to
   * the enquiry, not to the customer - someone may deliberately type a site
   * contact for this one job. So picking a different customer replaces them
   * only while they are still what the previous customer put there. Anything
   * typed by hand survives.
   *
   * Seeded from the form's own defaults, so on an existing request the details
   * that were saved with it count as "not typed in this session" and do follow
   * a change of customer.
   */
  const prefilledContact = React.useRef({ email: '', phoneNumber: '' })

  React.useEffect(() => {
    if (open) {
      reset(defaultValues)
      prefilledContact.current = {
        email: String(defaultValues.email ?? ''),
        phoneNumber: String(defaultValues.phoneNumber ?? ''),
      }
      setAutomationNote(null)
    }
  }, [open, defaultValues, reset])

  const applyCustomerContact = React.useCallback(
    (field: 'email' | 'phoneNumber', value: string | null) => {
      const current = String(getValues(field) ?? '')
      if (current !== '' && current !== prefilledContact.current[field]) return
      const next = value ?? ''
      setValue(field, next, { shouldDirty: true })
      prefilledContact.current[field] = next
    },
    [getValues, setValue],
  )

  /**
   * Apply the admin's Status/Probability linkage as the user picks, so the
   * linked field visibly updates in front of them. The server re-applies the
   * same rules on save - this is feedback, not the authority.
   */
  const runAutomation = React.useCallback(
    (changedType: DropdownTypeKey) => {
      if (automationRules.length === 0) return

      const current = getValues()
      const selection = {
        STATUS: current.statusValueId || null,
        LOCATION: current.locationValueId || null,
        MATERIAL: current.materialValueId || null,
        PROBABILITY: current.probabilityValueId || null,
      }

      const outcome = applyAutomationRules(selection, automationRules, changedType)
      if (outcome.applied.length === 0) return

      for (const change of outcome.applied) {
        const fieldName = FIELD_BY_TYPE[change.thenType]
        setValue(fieldName, change.toValueId, { shouldDirty: true })
      }

      const first = outcome.applied[0]
      setAutomationNote(
        `${TYPE_LABEL[first.thenType]} set to "${first.thenLabel}" automatically.`,
      )
      window.setTimeout(() => setAutomationNote(null), 4000)
    },
    [automationRules, getValues, setValue],
  )

  async function submit(values: EnquiryFormInput) {
    const result = await onSubmit(values)
    if (result.ok) {
      onOpenChange(false)
      return
    }
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
      const key = field.replace(/^data\./, '') as keyof EnquiryFormInput
      setError(key, { type: 'server', message })
    }
  }

  async function requestClose(next: boolean) {
    if (!next && isDirty && !isSubmitting) {
      const confirmed = await confirm({
        title: 'Discard your changes?',
        description:
          'This request has unsaved edits. Closing now will lose them.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'warning',
      })
      if (!confirmed) return
    }
    onOpenChange(next)
  }

  return (
    <>
    <AnimatedDialog open={open} onOpenChange={requestClose}>
      <DialogContent variant="drawer" size="lg" className="max-h-dvh">
        <DialogHeader eyebrow={isEdit ? `Job ${record?.jobNo}` : 'New enquiry'}>
          <DialogTitle>{isEdit ? 'Edit request' : 'Add request'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Changes are recorded in the audit history with the previous value.'
              : 'The new request appears at the top of the pipeline once saved.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-6">
            <FormErrorSummary
              message={
                Object.keys(errors).length > 0
                  ? 'This request could not be saved. Please correct the fields below.'
                  : null
              }
              fieldErrors={Object.fromEntries(
                Object.entries(errors)
                  .filter(([, error]) => error?.message)
                  .map(([field, error]) => [field, String(error?.message)]),
              )}
              labels={ENQUIRY_FIELD_LABELS}
            />

            {/* --- Customer & ownership ------------------------------------ */}
            <Section title="Customer">
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="customerName"
                  render={({ field }) => (
                    <Field
                      label="Customer name"
                      required
                      error={errors.customerName?.message}
                      hint="Pick from the list, or type a new name to add it."
                      className="sm:col-span-2"
                    >
                      <CustomerPicker
                        companyId={companyId}
                        customers={options.customers}
                        value={field.value ?? ''}
                        invalid={Boolean(errors.customerName)}
                        onSelect={(customer) => {
                          field.onChange(customer.name)
                          setValue('customerId', customer.id, { shouldDirty: true })
                          applyCustomerContact('email', customer.email)
                          applyCustomerContact('phoneNumber', customer.phone)
                        }}
                        onCreated={onCustomerCreated}
                      />
                    </Field>
                  )}
                />

                <Field
                  label="Project name"
                  htmlFor="enquiry-project-name"
                  required
                  error={errors.projectName?.message}
                >
                  <Input
                    id="enquiry-project-name"
                    invalid={Boolean(errors.projectName)}
                    {...register('projectName')}
                  />
                </Field>

                <Controller
                  control={control}
                  name="salesResponsibleId"
                  render={({ field }) => (
                    <Field label="Sales responsible" required error={errors.salesResponsibleId?.message}>
                      <Combobox
                        options={options.users}
                        value={field.value || null}
                        onChange={(value) => field.onChange(value ?? '')}
                        placeholder="Select a person"
                        searchPlaceholder="Search people..."
                        emptyText="No users in this company"
                      />
                    </Field>
                  )}
                />
              </div>
            </Section>

            {/* --- Classification ------------------------------------------ */}
            <Section
              title="Classification"
              aside={
                <AnimatePresence>
                  {automationNote ? (
                    <motion.span
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-medium text-brand-700"
                    >
                      <Wand2 className="size-3" />
                      {automationNote}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="statusValueId"
                  render={({ field }) => (
                    <Field label="Status" required error={errors.statusValueId?.message}>
                      <Combobox
                        options={options.status}
                        value={field.value || null}
                        onChange={(value) => {
                          field.onChange(value ?? '')
                          runAutomation('STATUS')
                        }}
                        placeholder="Select status"
                        emptyText="No status values configured"
                      />
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="probabilityValueId"
                  render={({ field }) => (
                    <Field label="Probability" required error={errors.probabilityValueId?.message}>
                      <Combobox
                        options={options.probability}
                        value={field.value || null}
                        onChange={(value) => {
                          field.onChange(value ?? '')
                          runAutomation('PROBABILITY')
                        }}
                        placeholder="Select probability"
                        emptyText="No probability values configured"
                      />
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="locationValueId"
                  render={({ field }) => (
                    <Field label="Location" required error={errors.locationValueId?.message}>
                      <Combobox
                        options={options.location}
                        value={field.value || null}
                        onChange={(value) => {
                          field.onChange(value ?? '')
                          runAutomation('LOCATION')
                        }}
                        placeholder="Select location"
                        emptyText="No locations configured"
                      />
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="materialValueId"
                  render={({ field }) => (
                    <Field label="Material" required error={errors.materialValueId?.message}>
                      <Combobox
                        options={options.material}
                        value={field.value || null}
                        onChange={(value) => {
                          field.onChange(value ?? '')
                          runAutomation('MATERIAL')
                        }}
                        placeholder="Select material"
                        emptyText="No materials configured"
                      />
                    </Field>
                  )}
                />
              </div>
            </Section>

            {/* --- Commercials --------------------------------------------- */}
            <Section title="Commercials">
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="enquiryDate"
                  render={({ field }) => (
                    <Field label="Enquiry date" error={errors.enquiryDate?.message}>
                      <DatePicker
                        value={field.value}
                        onChange={(value) => field.onChange(value ?? '')}
                        invalid={Boolean(errors.enquiryDate)}
                      />
                    </Field>
                  )}
                />

                <Field label={`Quote value (${currency})`} error={errors.quoteValue?.message}>
                  <Input
                    inputMode="decimal"
                    className="tabular"
                    invalid={Boolean(errors.quoteValue)}
                    {...register('quoteValue')}
                  />
                </Field>

                <Controller
                  control={control}
                  name="expectedOrderDate"
                  render={({ field }) => (
                    <Field label="Expected order date" error={errors.expectedOrderDate?.message}>
                      <DatePicker
                        value={field.value}
                        onChange={(value) => field.onChange(value ?? '')}
                        placeholder="Not set"
                      />
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="expectedBillingDate"
                  render={({ field }) => (
                    <Field
                      label="Expected billing date"
                      error={errors.expectedBillingDate?.message}
                    >
                      <DatePicker
                        value={field.value}
                        onChange={(value) => field.onChange(value ?? '')}
                        placeholder="Not set"
                        invalid={Boolean(errors.expectedBillingDate)}
                      />
                    </Field>
                  )}
                />
              </div>
            </Section>

            {/* --- Contact & notes ----------------------------------------- */}
            <Section title="Contact and notes">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" error={errors.email?.message}>
                  <Input
                    type="email"
                    autoComplete="off"
                    invalid={Boolean(errors.email)}
                    {...register('email')}
                  />
                </Field>

                <Field label="Phone number" error={errors.phoneNumber?.message}>
                  <Input {...register('phoneNumber')} />
                </Field>

                <Field
                  label="Enquiry details"
                  required
                  error={errors.enquiryDetails?.message}
                  className="sm:col-span-2"
                >
                  <Textarea
                    rows={3}
                    invalid={Boolean(errors.enquiryDetails)}
                    {...register('enquiryDetails')}
                  />
                </Field>

                <Field label="Remarks" error={errors.remarks?.message} className="sm:col-span-2">
                  <Textarea
                    rows={3}
                    {...register('remarks')}
                  />
                </Field>
              </div>
            </Section>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => void requestClose(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              loadingText={isEdit ? 'Saving...' : 'Adding...'}
            >
              {isEdit ? 'Save changes' : 'Add request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
    {confirmDialog}
    </>
  )
}

/** Human labels for the error summary, so it never shows a field name. */
const ENQUIRY_FIELD_LABELS: Record<string, string> = {
  enquiryDate: 'Enquiry date',
  salesResponsibleId: 'Sales responsible',
  customerName: 'Customer',
  projectName: 'Project name',
  statusValueId: 'Status',
  locationValueId: 'Location',
  materialValueId: 'Material',
  enquiryDetails: 'Enquiry details',
  quoteValue: 'Quote value',
  probabilityValueId: 'Probability',
  expectedOrderDate: 'Expected order date',
  expectedBillingDate: 'Expected billing date',
  email: 'Email',
  phoneNumber: 'Phone number',
  remarks: 'Remarks',
}

const FIELD_BY_TYPE: Record<DropdownTypeKey, keyof EnquiryFormInput> = {
  STATUS: 'statusValueId',
  LOCATION: 'locationValueId',
  MATERIAL: 'materialValueId',
  PROBABILITY: 'probabilityValueId',
}

const TYPE_LABEL: Record<DropdownTypeKey, string> = {
  STATUS: 'Status',
  LOCATION: 'Location',
  MATERIAL: 'Material',
  PROBABILITY: 'Probability',
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex min-h-6 items-center gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          {title}
        </h3>
        <span className="h-px flex-1 bg-ink-100" aria-hidden />
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * Customer picker.
 *
 * Selecting an existing customer is the fast path; typing a name that is not
 * in the list offers to add it, which creates the customer up front so it is
 * immediately reusable rather than becoming a one-off string.
 */
function CustomerPicker({
  companyId,
  customers,
  value,
  invalid,
  onSelect,
  onCreated,
}: {
  companyId: string
  customers: DrawerOption[]
  value: string
  invalid?: boolean
  onSelect: (customer: { id: string; name: string; email: string | null; phone: string | null }) => void
  onCreated: () => void
}) {
  const [draft, setDraft] = React.useState<CustomerDraft | null>(null)

  const selectedValue =
    customers.find((option) => option.label.toLowerCase() === value.trim().toLowerCase())?.value ??
    null

  return (
    <>
      <Combobox
        options={customers}
        value={selectedValue}
        invalid={invalid}
        placeholder={value || 'Search or add a customer'}
        searchPlaceholder="Search customers..."
        emptyText="No customers yet - type a name to add one"
        clearable={false}
        createLabel={(query) => `Add "${query}" as a new customer`}
        onChange={(id) => {
          const option = customers.find((customer) => customer.value === id)
          if (!option) return
          const [email, phone] = (option.keywords ?? '|').split('|')
          onSelect({
            id: option.value,
            name: option.label,
            email: email || null,
            phone: phone || null,
          })
        }}
        // Returning null hands off to the dialog below, so a customer entered
        // here can carry an email and phone rather than just a name.
        onCreate={(name) => {
          setDraft({ name, email: null, phone: null })
          return null
        }}
      />

      <CustomerFormDialog
        companyId={companyId}
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        customer={draft}
        onSaved={(customer) => {
          onSelect(customer)
          onCreated()
        }}
      />
    </>
  )
}

/** Option list builder shared by the drawer and the filter menus. */
export function customerOptions(
  customers: { id: string; name: string; email: string | null; phone: string | null; enquiryCount: number }[],
): DrawerOption[] {
  return customers.map((customer) => ({
    value: customer.id,
    label: customer.name,
    description: customer.email ?? customer.phone ?? undefined,
    // Packed so the picker can prefill contact fields without another lookup.
    keywords: `${customer.email ?? ''}|${customer.phone ?? ''}`,
    leading: (
      <span className="grid size-5 shrink-0 place-items-center rounded bg-ink-100 text-ink-400">
        <Building2 className="size-3" />
      </span>
    ),
  }))
}

export function userOptions(
  users: { id: string; name: string; displayCode: string | null; avatarColor: string }[],
): DrawerOption[] {
  return users.map((user) => ({
    value: user.id,
    label: user.name,
    description: user.displayCode ?? undefined,
    leading: <Avatar name={user.name} color={user.avatarColor} size="xs" />,
  }))
}

export function dropdownOptions(
  values: { id: string; label: string; color: string | null; isActive: boolean }[],
): DrawerOption[] {
  return values.map((value) => ({
    value: value.id,
    label: value.label,
    disabled: !value.isActive,
    description: value.isActive ? undefined : 'Inactive',
    leading: (
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-full', !value.color && 'bg-ink-300')}
        style={value.color ? { backgroundColor: value.color } : undefined}
      />
    ),
  }))
}

export { Sparkles }
