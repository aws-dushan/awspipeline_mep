'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { CheckboxVisual } from '@/components/ui/primitives'
import {
  CONFIGURABLE_ENQUIRY_FIELDS,
  isConfigurableField,
  type EnquiryFieldKey,
} from '@/lib/pipeline/enquiry-fields'
import { cn } from '@/lib/utils'
import { setRequiredFieldsAction } from '@/server/actions/dropdown-actions'

/**
 * Which fields a request must carry, for this company.
 *
 * The same list drives the markers on the form and the validation on the
 * server, so a field ticked here is asked for in the panel, enforced when the
 * row is saved from the grid, and refused by the server whatever sends it.
 */
export function RequiredFields({
  companyId,
  required,
}: {
  companyId: string
  required: string[]
}) {
  const initial = React.useMemo(
    () => new Set(required.filter(isConfigurableField)),
    [required],
  )
  const [selected, setSelected] = React.useState<Set<EnquiryFieldKey>>(initial)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => setSelected(initial), [initial])

  const dirty =
    selected.size !== initial.size || [...selected].some((field) => !initial.has(field))

  const toggle = (field: EnquiryFieldKey) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const result = await setRequiredFieldsAction({ companyId, fields: [...selected] })
    setSaving(false)

    if (!result.ok) {
      toast.error('Could not save the mandatory fields', { description: result.error })
      return
    }
    toast.success('Mandatory fields saved', {
      description: 'The request form asks for these from now on.',
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-ink-500">
        Tick the fields a request cannot be saved without. Customer name is always required, and
        the job number and enquiry date are set by the system, so none of those appear here.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {CONFIGURABLE_ENQUIRY_FIELDS.map((field) => {
          const checked = selected.has(field.field)
          return (
            <button
              key={field.field}
              type="button"
              onClick={() => toggle(field.field)}
              className={cn(
                'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
                checked
                  ? 'border-brand-200 bg-brand-50/60'
                  : 'border-ink-100 bg-white hover:border-ink-200',
              )}
            >
              <CheckboxVisual checked={checked} />
              <span className="flex-1 text-[13.5px] text-ink-800">{field.label}</span>
              <span className="text-[11.5px] text-ink-400">
                {checked ? 'Mandatory' : 'Optional'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-ink-100 pt-4">
        <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
          Save changes
        </Button>
        {dirty ? (
          <Button variant="ghost" onClick={() => setSelected(initial)} disabled={saving}>
            Reset
          </Button>
        ) : (
          <span className="text-[12.5px] text-ink-400">No unsaved changes.</span>
        )}
      </div>
    </div>
  )
}
