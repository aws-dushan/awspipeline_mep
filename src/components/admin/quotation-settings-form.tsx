'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { AdminPageHeader, AdminShell } from '@/components/admin/admin-page-header'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { buildReference, type QuotationSettingsValues } from '@/lib/quotation/quotation'
import { updateQuotationSettingsAction } from '@/server/actions/quotation-actions'

/**
 * Letterhead, numbering and the defaults every new quotation starts from.
 *
 * Changing these never rewrites a saved quotation's own terms - each version
 * keeps the terms it was issued with. The letterhead is printed from here, so
 * a corrected address shows on every PDF downloaded afterwards.
 */
export function QuotationSettingsForm({
  companyId,
  companyName,
  initial,
}: {
  companyId: string
  companyName: string
  initial: QuotationSettingsValues
}) {
  const router = useRouter()
  const [values, setValues] = React.useState(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const set = <K extends keyof QuotationSettingsValues>(key: K, value: QuotationSettingsValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const setTerm = (index: number, patch: Partial<QuotationSettingsValues['defaultTerms'][number]>) =>
    set(
      'defaultTerms',
      values.defaultTerms.map((term, i) => (i === index ? { ...term, ...patch } : term)),
    )

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await updateQuotationSettingsAction({ companyId, data: values })
    setSaving(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      toast.error('Could not save the settings', { description: result.error })
      return
    }
    toast.success(
      result.data.changeCount > 0 ? 'Quotation settings saved' : 'Nothing to save',
      result.data.changeCount > 0
        ? { description: 'New quotations and every PDF downloaded from now on use them.' }
        : undefined,
    )
    router.refresh()
  }

  const preview = buildReference(values.referencePrefix, 'DXB', 'J11292')

  return (
    <AdminShell>
      <AdminPageHeader
        title="Quotation settings"
        description={`The letterhead, reference numbers and default terms for ${companyName}'s quotations.`}
      />

      <form onSubmit={save} className="flex max-w-3xl flex-col gap-5">
        <section className="panel flex flex-col gap-4 p-5">
          <h2 className="text-[14px] font-semibold text-ink-900">Letterhead</h2>
          <Field label="Company name on the letterhead" required error={errors.letterheadName}>
            <Input
              value={values.letterheadName}
              onChange={(event) => set('letterheadName', event.target.value)}
              invalid={Boolean(errors.letterheadName)}
            />
          </Field>
          <Field label="Address" error={errors.address}>
            <Textarea
              value={values.address}
              onChange={(event) => set('address', event.target.value)}
              rows={2}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact number" hint="Starts every new quotation's contact number" error={errors.contactNumber}>
              <Input value={values.contactNumber} onChange={(event) => set('contactNumber', event.target.value)} />
            </Field>
            <Field label="Email" hint="Used when the sales owner has no email of their own" error={errors.email}>
              <Input value={values.email} onChange={(event) => set('email', event.target.value)} />
            </Field>
          </div>
          <Field label="Footer line" hint="Printed above the address at the foot of each page" error={errors.footerText}>
            <Input value={values.footerText} onChange={(event) => set('footerText', event.target.value)} />
          </Field>
        </section>

        <section className="panel flex flex-col gap-4 p-5">
          <h2 className="text-[14px] font-semibold text-ink-900">Reference numbers</h2>
          <Field label="Prefix" required error={errors.referencePrefix} className="sm:max-w-xs">
            <Input
              value={values.referencePrefix}
              onChange={(event) => set('referencePrefix', event.target.value)}
              invalid={Boolean(errors.referencePrefix)}
            />
          </Field>
          <p className="text-[12.5px] leading-relaxed text-ink-500">
            A quotation&apos;s reference is the prefix, the request&apos;s location and its Job No - for
            example <span className="font-semibold text-ink-900">{preview}</span>. It is set when the
            quotation is first saved and stays the same for every version.
          </p>
        </section>

        <section className="panel flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-[14px] font-semibold text-ink-900">Defaults for new quotations</h2>
            <p className="mt-1 text-[12.5px] text-ink-500">
              Copied into each new quotation, where they can still be changed. Saved quotations keep
              the terms they were issued with.
            </p>
          </div>
          <Field label="Scope of work" error={errors.defaultScope}>
            <Input value={values.defaultScope} onChange={(event) => set('defaultScope', event.target.value)} />
          </Field>
          <Field label="VAT note" error={errors.vatNote}>
            <Input value={values.vatNote} onChange={(event) => set('vatNote', event.target.value)} />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-ink-600">Terms &amp; conditions</span>
            {values.defaultTerms.map((term, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-md border border-ink-100 p-3 sm:flex-row sm:items-start">
                <Input
                  value={term.label}
                  onChange={(event) => setTerm(index, { label: event.target.value })}
                  placeholder="Title (leave empty for a note)"
                  className="sm:w-52"
                  aria-label={`Term ${index + 1} title`}
                />
                <Textarea
                  value={term.text}
                  onChange={(event) => setTerm(index, { text: event.target.value })}
                  rows={2}
                  invalid={Boolean(errors[`defaultTerms.${index}.text`])}
                  aria-label={`Term ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="dangerGhost"
                  size="iconSm"
                  aria-label="Remove term"
                  onClick={() => set('defaultTerms', values.defaultTerms.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set('defaultTerms', [...values.defaultTerms, { label: '', text: '' }])}
              >
                <Plus />
                Add term
              </Button>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving}>
            <Save />
            Save settings
          </Button>
        </div>
      </form>
    </AdminShell>
  )
}
