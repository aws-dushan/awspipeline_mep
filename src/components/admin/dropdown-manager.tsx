'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  Info,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DropdownTypeKey } from '@prisma/client'

import { AdminPageHeader, AdminShell } from '@/components/admin/admin-page-header'
import { AutomationRules } from '@/components/admin/automation-rules'
import { RequiredFields } from '@/components/admin/required-fields'
import { ColorPicker } from '@/components/admin/color-picker'
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
import { Input } from '@/components/ui/input'
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from '@/components/ui/primitives'
import type { DropdownCatalogue, DropdownOption } from '@/lib/database/dropdown-repository'
import type { AutomationRule } from '@/lib/pipeline/automation'
import { cn } from '@/lib/utils'
import {
  createDropdownValueAction,
  reorderDropdownValuesAction,
  toggleDropdownValueAction,
  updateDropdownValueAction,
} from '@/server/actions/dropdown-actions'

const TYPES: { key: DropdownTypeKey; label: string; description: string }[] = [
  {
    key: 'STATUS',
    label: 'Status',
    description: 'Where each enquiry sits in the sales cycle. Colour-coded on the pipeline.',
  },
  {
    key: 'LOCATION',
    label: 'Location',
    description: 'Emirate or site the enquiry relates to.',
  },
  {
    key: 'MATERIAL',
    label: 'Material',
    description: 'Product or trade category being quoted.',
  },
  {
    key: 'PROBABILITY',
    label: 'Probability',
    description:
      'Likelihood of winning. The weight (0-100) drives the weighted pipeline value and the bar shown in the grid.',
  },
]

export function DropdownManager({
  companyId,
  companyName,
  catalogue,
  usage,
  automationRules,
  requiredFields,
}: {
  companyId: string
  companyName: string
  catalogue: DropdownCatalogue
  usage: Record<string, number>
  automationRules: AutomationRule[]
  /** Which fields a request must carry, as configured for this company. */
  requiredFields: string[]
}) {
  const router = useRouter()
  const [activeType, setActiveType] = React.useState<DropdownTypeKey>('STATUS')
  const [dialogState, setDialogState] = React.useState<{
    open: boolean
    typeKey: DropdownTypeKey
    value: DropdownOption | null
  }>({ open: false, typeKey: 'STATUS', value: null })

  return (
    <AdminShell>
      <AdminPageHeader
        title="Dropdown settings"
        description={`Status, Location, Material and Probability values for ${companyName}. Values are never deleted - deactivate one instead and every historical record keeps its label.`}
        backHref={`/c/${companyId}/pipeline`}
        backLabel="Back to pipeline"
      />

      <Tabs
        value={activeType}
        onValueChange={(value) => setActiveType(value as DropdownTypeKey)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {TYPES.map((type) => (
              <TabsTrigger key={type.key} value={type.key}>
                {type.label}
                <span className="ml-1 rounded-full bg-ink-200/70 px-1.5 text-[10.5px] font-semibold tabular text-ink-500">
                  {catalogue[type.key].filter((value) => value.isActive).length}
                </span>
              </TabsTrigger>
            ))}
            <TabsTrigger value="AUTOMATION">Automation</TabsTrigger>
            <TabsTrigger value="REQUIRED">Mandatory fields</TabsTrigger>
          </TabsList>

          {activeType !== ('AUTOMATION' as DropdownTypeKey) &&
          activeType !== ('REQUIRED' as DropdownTypeKey) ? (
            <Button
              variant="primary"
              onClick={() => setDialogState({ open: true, typeKey: activeType, value: null })}
              className="group"
            >
              <Plus className="transition-transform duration-200 group-hover:rotate-90" />
              Add value
            </Button>
          ) : null}
        </div>

        {TYPES.map((type) => (
          <TabsContent key={type.key} value={type.key} className="min-h-0 flex-1">
            <ValueList
              companyId={companyId}
              type={type}
              values={catalogue[type.key]}
              usage={usage}
              onEdit={(value) => setDialogState({ open: true, typeKey: type.key, value })}
              onChanged={() => router.refresh()}
            />
          </TabsContent>
        ))}

        <TabsContent value="AUTOMATION" className="min-h-0 flex-1">
          <AutomationRules
            companyId={companyId}
            rules={automationRules}
            catalogue={catalogue}
            onChanged={() => router.refresh()}
          />
        </TabsContent>

        <TabsContent value="REQUIRED" className="min-h-0 flex-1">
          <RequiredFields companyId={companyId} required={requiredFields} />
        </TabsContent>
      </Tabs>

      <ValueDialog
        companyId={companyId}
        state={dialogState}
        onOpenChange={(open) => setDialogState((state) => ({ ...state, open }))}
        onSaved={() => router.refresh()}
      />
    </AdminShell>
  )
}

function ValueList({
  companyId,
  type,
  values,
  usage,
  onEdit,
  onChanged,
}: {
  companyId: string
  type: { key: DropdownTypeKey; label: string; description: string }
  values: DropdownOption[]
  usage: Record<string, number>
  onEdit: (value: DropdownOption) => void
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [order, setOrder] = React.useState(values)

  React.useEffect(() => setOrder(values), [values])

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= order.length) return

    const next = [...order]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setOrder(next)

    const result = await reorderDropdownValuesAction({
      companyId,
      typeKey: type.key,
      orderedIds: next.map((value) => value.id),
    })
    if (!result.ok) {
      setOrder(values)
      toast.error('Could not reorder', { description: result.error })
      return
    }
    onChanged()
  }

  async function toggle(value: DropdownOption) {
    setBusy(value.id)
    const result = await toggleDropdownValueAction({
      companyId,
      valueId: value.id,
      isActive: !value.isActive,
    })
    setBusy(null)

    if (!result.ok) {
      toast.error('Could not update the value', { description: result.error })
      return
    }

    toast.success(
      result.data.isActive ? `"${value.label}" is active again` : `"${value.label}" deactivated`,
      {
        description: result.data.isActive
          ? 'It is selectable again on new requests.'
          : result.data.usageCount > 0
            ? `${result.data.usageCount} existing ${result.data.usageCount === 1 ? 'record keeps' : 'records keep'} this value.`
            : 'It no longer appears in the pickers.',
      },
    )
    onChanged()
  }

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
        <Info className="mt-px size-4 shrink-0 text-ink-400" />
        <p className="text-[12.5px] leading-relaxed text-ink-500">{type.description}</p>
      </div>

      {order.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-ink-700">No {type.label.toLowerCase()} values</p>
          <p className="mt-1 text-[13px] text-ink-500">
            Add the first one so it can be selected on a request.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-100">
          <AnimatePresence initial={false}>
            {order.map((value, index) => {
              const used = usage[value.id] ?? 0
              return (
                <motion.li
                  key={value.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                  className={cn(
                    'group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-50/70',
                    !value.isActive && 'bg-ink-50/40',
                  )}
                >
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                      className="grid size-4 place-items-center rounded text-ink-300 transition-colors hover:text-ink-700 disabled:opacity-25"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1}
                      aria-label="Move down"
                      className="grid size-4 place-items-center rounded text-ink-300 transition-colors hover:text-ink-700 disabled:opacity-25"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <ValueBadge
                      label={value.label}
                      color={value.color}
                      inactive={!value.isActive}
                      size="md"
                    />
                  </div>

                  {type.key === 'PROBABILITY' ? (
                    <span className="hidden w-20 shrink-0 text-right text-[12px] text-ink-500 tabular sm:block">
                      {value.numericValue === null ? '—' : `${value.numericValue}% weight`}
                    </span>
                  ) : null}

                  <Tooltip
                    content={
                      used > 0
                        ? `${used} ${used === 1 ? 'record uses' : 'records use'} this value`
                        : 'Not used by any record yet'
                    }
                  >
                    <span className="hidden w-16 shrink-0 text-right text-[12px] text-ink-400 tabular sm:block">
                      {used > 0 ? used : '—'}
                    </span>
                  </Tooltip>

                  <div className="flex shrink-0 items-center gap-1">
                    {!value.isActive ? (
                      <Badge tone="neutral" size="sm" className="mr-1">
                        Inactive
                      </Badge>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => onEdit(value)}
                      aria-label={`Edit ${value.label}`}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Pencil />
                    </Button>

                    <Tooltip
                      content={
                        value.isActive
                          ? 'Deactivate - hides it from pickers, existing records keep it'
                          : 'Reactivate'
                      }
                    >
                      <Button
                        variant="ghost"
                        size="iconSm"
                        loading={busy === value.id}
                        onClick={() => toggle(value)}
                        aria-label={value.isActive ? 'Deactivate' : 'Reactivate'}
                        className={cn(
                          'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                          !value.isActive && 'opacity-100',
                        )}
                      >
                        {value.isActive ? <EyeOff /> : <RotateCcw />}
                      </Button>
                    </Tooltip>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function ValueDialog({
  companyId,
  state,
  onOpenChange,
  onSaved,
}: {
  companyId: string
  state: { open: boolean; typeKey: DropdownTypeKey; value: DropdownOption | null }
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = Boolean(state.value)
  const typeMeta = TYPES.find((type) => type.key === state.typeKey)!

  const [label, setLabel] = React.useState('')
  const [color, setColor] = React.useState<string | null>(null)
  const [numericValue, setNumericValue] = React.useState('')
  const [isActive, setIsActive] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!state.open) return
    setLabel(state.value?.label ?? '')
    setColor(state.value?.color ?? null)
    setNumericValue(
      state.value?.numericValue === null || state.value?.numericValue === undefined
        ? ''
        : String(state.value.numericValue),
    )
    setIsActive(state.value?.isActive ?? true)
    setError(null)
  }, [state])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const payload = {
      companyId,
      typeKey: state.typeKey,
      label,
      color: color ?? '',
      sortOrder: state.value?.sortOrder ?? 999,
      isActive,
      numericValue: state.typeKey === 'PROBABILITY' ? numericValue : '',
    }

    const result = isEdit
      ? await updateDropdownValueAction({ ...payload, valueId: state.value!.id })
      : await createDropdownValueAction(payload)

    setSubmitting(false)

    if (!result.ok) {
      setError(result.fieldErrors?.label ?? result.error)
      return
    }

    toast.success(isEdit ? 'Value updated' : `"${label}" added`)
    onOpenChange(false)
    onSaved()
  }

  return (
    <AnimatedDialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader eyebrow={typeMeta.label}>
          <DialogTitle>{isEdit ? 'Edit value' : 'Add value'}</DialogTitle>
          <DialogDescription>
            This value is available only to this company.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <Field label="Label" required error={error ?? undefined}>
              <Input
                autoFocus
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                invalid={Boolean(error)}
                maxLength={60}
              />
            </Field>

            <Field label="Colour" hint="Shown as the badge tint in the pipeline.">
              <ColorPicker value={color} onChange={setColor} allowEmpty />
            </Field>

            {state.typeKey === 'PROBABILITY' ? (
              <Field
                label="Weight"
                hint="0 to 100. Used for the weighted pipeline value and the bar in the grid."
              >
                <Input
                  inputMode="decimal"
                  className="tabular"
                  value={numericValue}
                  onChange={(event) => setNumericValue(event.target.value)}
                  />
              </Field>
            ) : null}

            <label className="flex cursor-pointer items-center justify-between rounded-md border border-ink-100 bg-ink-50/60 px-3.5 py-3">
              <span>
                <span className="block text-[13px] font-medium text-ink-800">Active</span>
                <span className="block text-[12px] text-ink-500">
                  Inactive values stay on existing records but cannot be picked.
                </span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>

            {label ? (
              <div className="rounded-md border border-dashed border-ink-200 px-3.5 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">
                  Preview
                </p>
                <ValueBadge label={label} color={color} inactive={!isActive} />
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {isEdit ? 'Save changes' : 'Add value'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
  )
}
