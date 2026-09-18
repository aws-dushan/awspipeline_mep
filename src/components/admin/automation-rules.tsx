'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Info, Plus, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DropdownTypeKey } from '@prisma/client'

import { Badge, ValueBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { useConfirm } from '@/components/ui/confirm-dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch, Tooltip } from '@/components/ui/primitives'
import type { DropdownCatalogue } from '@/lib/database/dropdown-repository'
import { describeRule, type AutomationRule } from '@/lib/pipeline/automation'
import { cn } from '@/lib/utils'
import {
  createAutomationRuleAction,
  deleteAutomationRuleAction,
  toggleAutomationRuleAction,
} from '@/server/actions/automation-actions'

const TYPE_LABELS: Record<DropdownTypeKey, string> = {
  STATUS: 'Status',
  LOCATION: 'Location',
  MATERIAL: 'Material',
  PROBABILITY: 'Probability',
}

/**
 * The fields a rule can read or write.
 *
 * Only the single-valued ones. A request carries a set of locations and a set
 * of materials, so "when Material is X" has no single answer and "then
 * Material is X" does not say whether to add or replace. Offering them would
 * be offering a rule that cannot be defined.
 */
const TYPE_OPTIONS: DropdownTypeKey[] = ['STATUS', 'PROBABILITY']

/**
 * Field linkage rules.
 *
 * The default pair - "Probability 100% means Won" and its mirror - ships with
 * every company, but nothing about it is hard-coded: an admin can switch them
 * off, retarget them, or add their own pairs between any two dropdown fields.
 */
export function AutomationRules({
  companyId,
  rules,
  catalogue,
  onChanged,
}: {
  companyId: string
  rules: AutomationRule[]
  catalogue: DropdownCatalogue
  onChanged: () => void
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  async function toggle(rule: AutomationRule) {
    setBusy(rule.id)
    const result = await toggleAutomationRuleAction({
      companyId,
      ruleId: rule.id,
      isActive: !rule.isActive,
    })
    setBusy(null)

    if (!result.ok) {
      toast.error('Could not update the rule', { description: result.error })
      return
    }
    toast.success(result.data.isActive ? 'Rule enabled' : 'Rule disabled')
    onChanged()
  }

  async function remove(rule: AutomationRule) {
    const confirmed = await confirm({
      title: 'Remove this rule?',
      description: `"${describeRule(rule)}" will no longer be applied. Existing records keep the values they already have.`,
      confirmLabel: 'Remove rule',
      tone: 'danger',
    })
    if (!confirmed) return
    setBusy(rule.id)
    const result = await deleteAutomationRuleAction({ companyId, ruleId: rule.id })
    setBusy(null)

    if (!result.ok) {
      toast.error('Could not remove the rule', { description: result.error })
      return
    }
    toast.success('Rule removed')
    onChanged()
  }

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
        <Info className="mt-px size-4 shrink-0 text-ink-400" />
        <p className="text-[12.5px] leading-relaxed text-ink-500">
          When someone sets one field, a rule can set another automatically. The linked field
          updates in the form as they pick, and the rule is re-applied on the server when the
          record is saved.
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Wand2 className="size-5" />
          </span>
          <div>
            <p className="text-[14.5px] font-semibold text-ink-900">No automation rules</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500">
              Add one to keep linked fields consistent, for example setting Status to Won whenever
              Probability reaches 100%.
            </p>
          </div>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <Plus />
            Add rule
          </Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-ink-100">
            <AnimatePresence initial={false}>
              {rules.map((rule) => (
                <motion.li
                  key={rule.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                  className={cn(
                    'group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-ink-50/70',
                    !rule.isActive && 'bg-ink-50/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-ink-400">When</span>
                    <span className="text-[12.5px] font-semibold text-ink-600">
                      {TYPE_LABELS[rule.whenType]}
                    </span>
                    <span className="text-[12px] text-ink-400">is</span>
                    <ValueBadge
                      label={rule.whenLabel}
                      color={valueColor(catalogue, rule.whenType, rule.whenValueId)}
                      size="sm"
                      inactive={!rule.isActive}
                    />
                  </span>

                  <ArrowRight className="size-3.5 shrink-0 text-ink-300" />

                  <span className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-ink-400">set</span>
                    <span className="text-[12.5px] font-semibold text-ink-600">
                      {TYPE_LABELS[rule.thenType]}
                    </span>
                    <span className="text-[12px] text-ink-400">to</span>
                    <ValueBadge
                      label={rule.thenLabel}
                      color={valueColor(catalogue, rule.thenType, rule.thenValueId)}
                      size="sm"
                      inactive={!rule.isActive}
                    />
                  </span>

                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {!rule.isActive ? (
                      <Badge tone="neutral" size="sm">
                        Off
                      </Badge>
                    ) : null}

                    <Tooltip content={rule.isActive ? 'Disable this rule' : 'Enable this rule'}>
                      <Switch
                        checked={rule.isActive}
                        disabled={busy === rule.id}
                        onCheckedChange={() => toggle(rule)}
                      />
                    </Tooltip>

                    <Button
                      variant="ghost"
                      size="iconSm"
                      loading={busy === rule.id}
                      onClick={() => remove(rule)}
                      aria-label="Remove rule"
                      className="text-ink-400 opacity-0 transition-opacity hover:text-negative group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <div className="border-t border-ink-100 p-3">
            <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus />
              Add rule
            </Button>
          </div>
        </>
      )}

      <RuleDialog
        companyId={companyId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        catalogue={catalogue}
        onSaved={onChanged}
      />

      {confirmDialog}
    </div>
  )
}

function valueColor(
  catalogue: DropdownCatalogue,
  type: DropdownTypeKey,
  valueId: string,
): string | null {
  return catalogue[type].find((value) => value.id === valueId)?.color ?? null
}

function RuleDialog({
  companyId,
  open,
  onOpenChange,
  catalogue,
  onSaved,
}: {
  companyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogue: DropdownCatalogue
  onSaved: () => void
}) {
  const [whenType, setWhenType] = React.useState<DropdownTypeKey>('PROBABILITY')
  const [whenValueId, setWhenValueId] = React.useState<string | null>(null)
  const [thenType, setThenType] = React.useState<DropdownTypeKey>('STATUS')
  const [thenValueId, setThenValueId] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setWhenType('PROBABILITY')
    setWhenValueId(null)
    setThenType('STATUS')
    setThenValueId(null)
    setError(null)
  }, [open])

  // A rule must link two different fields, so keep the target away from the
  // trigger field automatically rather than rejecting it on submit.
  React.useEffect(() => {
    if (thenType === whenType) {
      setThenType(TYPE_OPTIONS.find((type) => type !== whenType) ?? 'STATUS')
      setThenValueId(null)
    }
  }, [whenType, thenType])

  const toOptions = (type: DropdownTypeKey) =>
    catalogue[type].map((value) => ({
      value: value.id,
      label: value.label,
      description: value.isActive ? undefined : 'Inactive',
      leading: (
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', !value.color && 'bg-ink-300')}
          style={value.color ? { backgroundColor: value.color } : undefined}
        />
      ),
    }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!whenValueId || !thenValueId) {
      setError('Choose both values.')
      return
    }

    setSubmitting(true)
    setError(null)
    const result = await createAutomationRuleAction({
      companyId,
      whenType,
      whenValueId,
      thenType,
      thenValueId,
      isActive: true,
    })
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast.success('Automation rule added')
    onOpenChange(false)
    onSaved()
  }

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader eyebrow="Automation">
          <DialogTitle>Add a rule</DialogTitle>
          <DialogDescription>
            Link two dropdown fields so setting one updates the other.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-5">
            <section className="rounded-lg border border-ink-100 bg-ink-50/50 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                When
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Field">
                  <Select
                    value={whenType}
                    onValueChange={(value) => {
                      setWhenType(value as DropdownTypeKey)
                      setWhenValueId(null)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Is">
                  <Combobox
                    options={toOptions(whenType)}
                    value={whenValueId}
                    onChange={setWhenValueId}
                    placeholder="Select value"
                    emptyText="No values configured"
                  />
                </Field>
              </div>
            </section>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-ink-100" />
              <ArrowRight className="size-4 text-ink-300" />
              <span className="h-px flex-1 bg-ink-100" />
            </div>

            <section className="rounded-lg border border-brand-100 bg-brand-50/40 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
                Then set
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Field">
                  <Select
                    value={thenType}
                    onValueChange={(value) => {
                      setThenType(value as DropdownTypeKey)
                      setThenValueId(null)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.filter((type) => type !== whenType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="To">
                  <Combobox
                    options={toOptions(thenType)}
                    value={thenValueId}
                    onChange={setThenValueId}
                    placeholder="Select value"
                    emptyText="No values configured"
                  />
                </Field>
              </div>
            </section>

            <AnimatePresence>
              {error ? (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="text-[12.5px] font-medium text-negative"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Add rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
  )
}
