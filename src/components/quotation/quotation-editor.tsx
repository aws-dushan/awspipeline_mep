'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  History,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Tooltip } from '@/components/ui/primitives'
import { apiPath } from '@/lib/base-path'
import type { QuotationView } from '@/lib/database/quotation-repository'
import { formatDateTime } from '@/lib/format'
import {
  AFRA_LOGO,
  AWS_LOGO,
  BRAND_3,
  BRAND_4,
  BRAND_5,
  BRAND_6,
  BRAND_7,
  BRAND_8,
  BRAND_9,
} from '@/lib/quotation/logos'
import {
  lineTotal,
  quotationFormSchema,
  quotationTotal,
  revisionLabel,
  type QuotationFormValues,
  type QuotationItem,
  type QuotationSettingsValues,
  type SaveMode,
} from '@/lib/quotation/quotation'
import { cn } from '@/lib/utils'
import { saveQuotationAction } from '@/server/actions/quotation-actions'

/**
 * The quotation editor: a sheet laid out like the quotation itself.
 *
 * Every field sits where it prints, so what is typed is visibly what the
 * customer will read. Beside it, every version of the quotation, each of which
 * can be opened, viewed as a PDF or downloaded at any time.
 */

/** Numbers are held as typed, so a half-entered "1." or an empty cell survives. */
type DraftItem = Omit<QuotationItem, 'qty' | 'unitPrice'> & {
  qty: number | string
  unitPrice: number | string
}
type Draft = Omit<QuotationFormValues, 'items'> & { items: DraftItem[] }

const amountFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** A stable fingerprint, so "1400" typed over 1400 does not read as a change. */
function fingerprint(draft: Draft): string {
  return JSON.stringify({
    ...draft,
    items: draft.items.map((item) => ({ ...item, qty: Number(item.qty), unitPrice: Number(item.unitPrice) })),
  })
}

export type QuotationEditorProps = {
  company: { id: string; currency: string }
  enquiry: { id: string; jobNo: string; customerName: string; projectName: string | null }
  settings: QuotationSettingsValues
  quotation: QuotationView | null
  /** The reference a new quotation will be issued under. */
  referencePreview: string
  selectedVersionId: string | null
  /** The starting sheet when there is no quotation yet. */
  draft: QuotationFormValues | null
  canEdit: boolean
}

export function QuotationEditor({
  company,
  enquiry,
  settings,
  quotation,
  referencePreview,
  selectedVersionId,
  draft,
  canEdit,
}: QuotationEditorProps) {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()

  const versions = quotation?.versions ?? []
  const latest = versions[0] ?? null
  const selected = versions.find((version) => version.id === selectedVersionId) ?? null
  const base: Draft = selected?.values ?? draft!
  const isNew = !quotation

  const [values, setValues] = React.useState<Draft>(base)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState<SaveMode | null>(null)

  const dirty = React.useMemo(() => fingerprint(values) !== fingerprint(base), [values, base])
  const total = quotationTotal(values.items.map((item) => ({ qty: Number(item.qty), unitPrice: Number(item.unitPrice) })))
  const readOnly = !canEdit

  // Leaving with unsaved edits asks first - closing the tab included.
  React.useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const patch = React.useCallback((next: Partial<Draft>) => {
    setValues((current) => ({ ...current, ...next }))
    setErrors((current) => {
      const cleared = { ...current }
      for (const key of Object.keys(next)) {
        for (const errorKey of Object.keys(cleared)) {
          if (errorKey === key || errorKey.startsWith(`${key}.`)) delete cleared[errorKey]
        }
      }
      return cleared
    })
  }, [])

  const setItem = (index: number, next: Partial<DraftItem>) => {
    setValues((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, ...next } : item)),
    }))
    setErrors((current) => {
      const cleared = { ...current }
      for (const key of Object.keys(next)) delete cleared[`items.${index}.${key}`]
      delete cleared.items
      return cleared
    })
  }

  const moveItem = (index: number, offset: -1 | 1) => {
    setValues((current) => {
      const items = [...current.items]
      const target = index + offset
      if (target < 0 || target >= items.length) return current
      ;[items[index], items[target]] = [items[target], items[index]]
      return { ...current, items }
    })
    // Messages are keyed by position, so they would now point at the wrong row.
    setErrors({})
  }

  const removeItem = (index: number) => {
    setValues((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))
    setErrors({})
  }

  const duplicateItem = (index: number) => {
    setValues((current) => {
      const items = [...current.items]
      items.splice(index + 1, 0, { ...items[index] })
      return { ...current, items }
    })
    setErrors({})
  }

  const addItem = () =>
    setValues((current) => ({
      ...current,
      items: [...current.items, { description: '', make: '', qty: 1, unitPrice: '' }],
    }))

  const setTerm = (index: number, next: Partial<Draft['terms'][number]>) => {
    setValues((current) => ({
      ...current,
      terms: current.terms.map((term, i) => (i === index ? { ...term, ...next } : term)),
    }))
    setErrors((current) => {
      const cleared = { ...current }
      delete cleared[`terms.${index}.text`]
      return cleared
    })
  }

  // --- Saving ---------------------------------------------------------------

  async function save(mode: SaveMode) {
    const parsed = quotationFormSchema.safeParse(values)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form'
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      toast.error('Some fields need attention', {
        description: Object.values(fieldErrors)[0],
      })
      return
    }

    setSaving(mode)
    const result = await saveQuotationAction({
      companyId: company.id,
      enquiryId: enquiry.id,
      versionId: selected?.id ?? null,
      mode,
      data: parsed.data,
    })
    setSaving(null)

    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors)
      toast.error('Could not save the quotation', { description: result.error })
      return
    }

    const saved = result.data
    const label = revisionLabel(saved.revision)
    toast.success(
      saved.created === 'quotation'
        ? `Quotation ${saved.referenceNo} ${label} created`
        : saved.created === 'version'
          ? `${label} saved as a new version`
          : `${label} updated`,
      {
        description:
          [
            saved.quoteValueUpdated
              ? `Quote Value is now ${company.currency} ${amountFormat.format(quotationTotal(parsed.data.items))}.`
              : null,
            saved.statusChangedTo ? `Status is now ${saved.statusChangedTo}.` : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined,
      },
    )

    const target = `/c/${company.id}/quotations/${enquiry.id}?v=${saved.revision}`
    router.replace(target, { scroll: false })
    router.refresh()
  }

  async function openVersion(revision: number) {
    if (dirty) {
      const leave = await confirm({
        title: 'Discard your changes?',
        description: 'The edits on this sheet have not been saved. Opening another version will lose them.',
        confirmLabel: 'Discard and open',
        tone: 'warning',
      })
      if (!leave) return
    }
    router.push(`/c/${company.id}/quotations/${enquiry.id}?v=${revision}`, { scroll: false })
  }

  const pdfHref = (versionId: string, download: boolean) =>
    apiPath(
      `/api/quotations/${versionId}/pdf?companyId=${encodeURIComponent(company.id)}${download ? '&download=1' : ''}`,
    )

  const nextRevision = (latest?.revision ?? -1) + 1
  const isLatest = selected !== null && selected.id === latest?.id

  // --- Render ---------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="sticky top-14 z-20 border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/c/${company.id}/pipeline`}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-400 transition-colors hover:text-brand-600"
            >
              <ArrowLeft className="size-3.5" />
              Pipeline
            </Link>
            <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-ink-900">
              {quotation ? `Quotation ${quotation.referenceNo}` : `New quotation ${referencePreview}`}
              {selected ? (
                <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[12px] font-semibold text-brand-700">
                  {revisionLabel(selected.revision)}
                </span>
              ) : null}
              <span className="text-[13px] font-normal text-ink-400">
                Job {enquiry.jobNo} · {enquiry.customerName}
              </span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <span className="text-[12px] font-medium text-warning">Unsaved changes</span>
            ) : null}

            {selected ? (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <a href={pdfHref(selected.id, false)} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    View PDF
                  </a>
                </Button>
                <Tooltip content={dirty ? 'Save first - the PDF prints the saved version' : null}>
                  <span>
                    <Button variant="secondary" size="sm" disabled={dirty} asChild={!dirty}>
                      {dirty ? (
                        <>
                          <Download />
                          Download PDF
                        </>
                      ) : (
                        <a href={pdfHref(selected.id, true)}>
                          <Download />
                          Download PDF
                        </a>
                      )}
                    </Button>
                  </span>
                </Tooltip>
              </>
            ) : null}

            {canEdit ? (
              isNew ? (
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving !== null}
                  onClick={() => void save('new-version')}
                >
                  <Save />
                  Create quotation ({revisionLabel(0)})
                </Button>
              ) : (
                <>
                  <Tooltip
                    content={`Overwrite ${selected ? revisionLabel(selected.revision) : ''} with these changes`}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!dirty || saving !== null}
                      loading={saving === 'update-version'}
                      onClick={() => void save('update-version')}
                    >
                      <Save />
                      Update {selected ? revisionLabel(selected.revision) : ''}
                    </Button>
                  </Tooltip>
                  <Tooltip
                    content={`Keep ${selected ? revisionLabel(selected.revision) : 'this version'} as it is and save these changes as ${revisionLabel(nextRevision)}`}
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!dirty || saving !== null}
                      loading={saving === 'new-version'}
                      onClick={() => void save('new-version')}
                    >
                      <FilePlus2 />
                      Save as {revisionLabel(nextRevision)}
                    </Button>
                  </Tooltip>
                </>
              )
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-5 px-3 py-5 sm:px-6 xl:flex-row xl:items-start">
        {/* The sheet */}
        <div className="min-w-0 flex-1">
          {selected && !isLatest ? (
            <div className="mx-auto mb-3 max-w-[860px] rounded-md border border-warning/30 bg-warning-soft px-4 py-2.5 text-[12.5px] text-warning">
              You are looking at {revisionLabel(selected.revision)}, an earlier version.
              {canEdit
                ? ` Saving as ${revisionLabel(nextRevision)} makes these values the latest quotation.`
                : null}
            </div>
          ) : null}
          {readOnly ? (
            <div className="mx-auto mb-3 max-w-[860px] rounded-md border border-ink-100 bg-ink-50 px-4 py-2.5 text-[12.5px] text-ink-500">
              You can view and download this quotation. Only the request&apos;s owner or a
              supervisor can change it.
            </div>
          ) : null}

          <article className="mx-auto max-w-[880px] border border-ink-200 bg-white px-5 py-7 text-[12.5px] text-ink-900 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_12px_32px_-12px_rgba(16,24,40,0.18)] sm:px-9 sm:py-9">
            {/* Letterhead - as on the issued quotation */}
            <header className="mb-3 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AWS_LOGO} alt="" className="h-16 w-auto shrink-0" />
              <p className="min-w-0 flex-1 text-center text-[14px] font-bold leading-snug">
                {settings.letterheadName}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AFRA_LOGO} alt="" className="h-11 w-auto shrink-0" />
            </header>

            <Bar>QUOTATION</Bar>

            {/* Details grid */}
            <table className="w-full border-collapse">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[32%]" />
                <col className="w-[18%]" />
                <col className="w-[32%]" />
              </colgroup>
              <tbody>
                <tr>
                  <LabelCell>Date</LabelCell>
                  <ValueCell error={errors.quotationDate}>
                    <SheetInput
                      type="date"
                      value={values.quotationDate}
                      onChange={(quotationDate) => patch({ quotationDate })}
                      readOnly={readOnly}
                      error={errors.quotationDate}
                      aria-label="Quotation date"
                    />
                  </ValueCell>
                  <LabelCell shaded>Reference Number</LabelCell>
                  <ValueCell>
                    <p className="px-1.5 py-1 font-semibold">
                      {quotation?.referenceNo ?? referencePreview}
                      <span className="ml-3 text-brand-600">{revisionLabel(selected?.revision ?? 0)}</span>
                    </p>
                  </ValueCell>
                </tr>
                <tr>
                  <LabelCell>Sales Responsible</LabelCell>
                  <ValueCell>
                    <FixedText value={values.salesName} placeholder="No sales owner on the request" />
                  </ValueCell>
                  <LabelCell shaded>Customer Name</LabelCell>
                  <ValueCell error={errors.customerName}>
                    {/* Wraps rather than scrolls: company names run long. */}
                    <SheetTextarea
                      value={values.customerName}
                      onChange={(customerName) => patch({ customerName })}
                      placeholder="Customer name"
                      readOnly={readOnly}
                      error={errors.customerName}
                      className="font-semibold"
                      aria-label="Customer name"
                    />
                  </ValueCell>
                </tr>
                <tr>
                  <LabelCell>Contact Number</LabelCell>
                  <ValueCell>
                    <FixedText value={values.salesPhone} />
                  </ValueCell>
                  <LabelCell shaded>Attention</LabelCell>
                  <ValueCell>
                    <div className="flex items-center gap-1">
                      <SheetInput
                        value={values.attention}
                        onChange={(attention) => patch({ attention })}
                        placeholder="Contact person"
                        readOnly={readOnly}
                        aria-label="Attention"
                      />
                      <span className="shrink-0 text-[11px] font-semibold text-ink-500">PH:</span>
                      <SheetInput
                        value={values.attentionPhone}
                        onChange={(attentionPhone) => patch({ attentionPhone })}
                        placeholder="Phone"
                        readOnly={readOnly}
                        className="w-[7.5rem] shrink-0"
                        aria-label="Attention phone"
                      />
                    </div>
                  </ValueCell>
                </tr>
                <tr>
                  <LabelCell>Email</LabelCell>
                  <ValueCell>
                    <FixedText value={values.salesEmail} />
                  </ValueCell>
                  <LabelCell shaded>E-mail</LabelCell>
                  <ValueCell>
                    <SheetInput
                      value={values.customerEmail}
                      onChange={(customerEmail) => patch({ customerEmail })}
                      placeholder="customer@example.com"
                      readOnly={readOnly}
                      aria-label="Customer email"
                    />
                  </ValueCell>
                </tr>
                {/* Both addresses on one row: it is the tall one, so the
                    customer's address gets the room the sales address has. */}
                <tr>
                  <LabelCell>Address</LabelCell>
                  <ValueCell>
                    <p className="whitespace-pre-line px-1.5 py-1 text-ink-700">{settings.address}</p>
                  </ValueCell>
                  <LabelCell shaded>Address</LabelCell>
                  <ValueCell>
                    <SheetTextarea
                      value={values.customerAddress}
                      onChange={(customerAddress) => patch({ customerAddress })}
                      placeholder="Customer address"
                      readOnly={readOnly}
                      aria-label="Customer address"
                    />
                  </ValueCell>
                </tr>
                <tr>
                  <LabelCell>Valid Until</LabelCell>
                  <ValueCell>
                    <SheetInput
                      type="date"
                      value={values.validUntil ?? ''}
                      onChange={(validUntil) => patch({ validUntil: validUntil || null })}
                      readOnly={readOnly}
                      aria-label="Valid until"
                    />
                  </ValueCell>
                  <LabelCell shaded>Customer Ref.</LabelCell>
                  <ValueCell>
                    <SheetTextarea
                      value={values.customerRef}
                      onChange={(customerRef) => patch({ customerRef })}
                      placeholder="Enquiry or project reference"
                      readOnly={readOnly}
                      aria-label="Customer reference"
                    />
                  </ValueCell>
                </tr>
                <tr>
                  <td className="border border-ink-500" />
                  <td className="border border-ink-500" />
                  <LabelCell shaded>Enquiry Date</LabelCell>
                  <ValueCell>
                    <SheetInput
                      type="date"
                      value={values.enquiryDate ?? ''}
                      onChange={(enquiryDate) => patch({ enquiryDate: enquiryDate || null })}
                      readOnly={readOnly}
                      aria-label="Enquiry date"
                    />
                  </ValueCell>
                </tr>
              </tbody>
            </table>

            <div className="h-4" />
            <Bar>Quotation for the supply of the following items</Bar>

            {/* Items */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] border-collapse">
                <thead>
                  <tr className="text-center text-[12px] font-bold">
                    <HeadCell className="w-12">S.No.</HeadCell>
                    <HeadCell>Description</HeadCell>
                    <HeadCell className="w-28">Make</HeadCell>
                    <HeadCell className="w-16">Qty</HeadCell>
                    <HeadCell className="w-28">
                      Unit Price
                      <br />({company.currency})
                    </HeadCell>
                    <HeadCell className="w-32">
                      Total Price
                      <br />({company.currency})
                    </HeadCell>
                    {canEdit ? <th className="w-[60px]" aria-label="Row actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {values.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className={cn(
                          'border border-ink-500 px-3 py-6 text-center text-ink-400',
                          errors.items && 'bg-negative-soft/50 text-negative',
                        )}
                      >
                        No items yet.
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={addItem}
                            className="ml-2 font-medium text-brand-600 hover:underline"
                          >
                            Add the first item
                          </button>
                        ) : null}
                      </td>
                      {canEdit ? <td /> : null}
                    </tr>
                  ) : null}
                  {values.items.map((item, index) => (
                    <tr key={index} className="group/item align-top">
                      <td className="border border-ink-500 px-2 py-2 text-center tabular">{index + 1}</td>
                      <td className="border border-ink-500 p-0.5">
                        <SheetTextarea
                          value={item.description}
                          onChange={(description) => setItem(index, { description })}
                          placeholder="Item description, model number…"
                          readOnly={readOnly}
                          error={errors[`items.${index}.description`]}
                          className="font-semibold"
                          aria-label={`Item ${index + 1} description`}
                        />
                      </td>
                      <td className="border border-ink-500 p-0.5">
                        <SheetInput
                          value={item.make}
                          onChange={(make) => setItem(index, { make })}
                          placeholder="Make"
                          readOnly={readOnly}
                          className="text-center"
                          aria-label={`Item ${index + 1} make`}
                        />
                      </td>
                      <td className="border border-ink-500 p-0.5">
                        <SheetInput
                          inputMode="decimal"
                          value={String(item.qty)}
                          onChange={(qty) => setItem(index, { qty })}
                          readOnly={readOnly}
                          error={errors[`items.${index}.qty`]}
                          className="text-center tabular"
                          aria-label={`Item ${index + 1} quantity`}
                        />
                      </td>
                      <td className="border border-ink-500 p-0.5">
                        <SheetInput
                          inputMode="decimal"
                          value={String(item.unitPrice)}
                          onChange={(unitPrice) => setItem(index, { unitPrice })}
                          placeholder="0.00"
                          readOnly={readOnly}
                          error={errors[`items.${index}.unitPrice`]}
                          className="text-right tabular"
                          aria-label={`Item ${index + 1} unit price`}
                        />
                      </td>
                      <td className="border border-ink-500 px-2 py-2 text-right tabular">
                        {amountFormat.format(
                          lineTotal({ qty: Number(item.qty), unitPrice: Number(item.unitPrice) }),
                        )}
                      </td>
                      {canEdit ? (
                        <td className="py-1 pl-1">
                          <div className="grid grid-cols-2 gap-0.5 opacity-40 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100">
                            <RowButton label="Move up" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                              <ArrowUp />
                            </RowButton>
                            <RowButton
                              label="Move down"
                              disabled={index === values.items.length - 1}
                              onClick={() => moveItem(index, 1)}
                            >
                              <ArrowDown />
                            </RowButton>
                            <RowButton label="Duplicate" onClick={() => duplicateItem(index)}>
                              <Copy />
                            </RowButton>
                            <RowButton label="Remove" onClick={() => removeItem(index)} destructive>
                              <Trash2 />
                            </RowButton>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}

                  <tr>
                    <td className="border border-ink-500" />
                    <td colSpan={5} className="border border-ink-500 p-0.5">
                      <div className="flex items-center gap-1 pl-1.5 font-bold">
                        <span className="shrink-0">SCOPE OF WORK :</span>
                        <SheetInput
                          value={values.scopeOfWork}
                          onChange={(scopeOfWork) => patch({ scopeOfWork })}
                          placeholder="e.g. SUPPLY OF EQUIPMENT ONLY"
                          readOnly={readOnly}
                          className="font-bold"
                          aria-label="Scope of work"
                        />
                      </div>
                    </td>
                    {canEdit ? <td /> : null}
                  </tr>

                  <tr className="bg-[#FAE2D6]">
                    <td colSpan={3} className="border border-ink-500 p-0.5">
                      <div className="flex items-center text-[11.5px] italic">
                        <span className="pl-1.5">(</span>
                        <SheetInput
                          value={values.vatNote}
                          onChange={(vatNote) => patch({ vatNote })}
                          placeholder="VAT note"
                          readOnly={readOnly}
                          className="text-[11.5px] italic"
                          aria-label="VAT note"
                        />
                        <span className="pr-1.5">)</span>
                      </div>
                    </td>
                    <td colSpan={2} className="border border-ink-500 px-2 py-2 text-right font-bold">
                      Total Price in {company.currency}
                    </td>
                    <td className="border border-ink-500 px-2 py-2 text-right text-[13.5px] font-bold tabular">
                      {amountFormat.format(total)}
                    </td>
                    {canEdit ? <td className="bg-white" /> : null}
                  </tr>
                </tbody>
              </table>
            </div>

            {canEdit ? (
              <button
                type="button"
                onClick={addItem}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium text-brand-600 transition-colors hover:bg-brand-50"
              >
                <Plus className="size-3.5" />
                Add item
              </button>
            ) : null}
            {errors.items ? (
              <p className="mt-1 text-[12px] font-medium text-negative">{errors.items}</p>
            ) : null}

            {/* Terms */}
            <section className="mt-6">
              <h2 className="mb-2 text-[13px] font-bold">TERMS &amp; CONDITIONS</h2>
              <div className="flex flex-col">
                {values.terms.map((term, index) => (
                  <div key={index} className="group/term flex items-start gap-2 py-0.5">
                    <SheetInput
                      value={term.label}
                      onChange={(label) => setTerm(index, { label })}
                      placeholder="(note - no title)"
                      readOnly={readOnly}
                      className="w-48 shrink-0 font-bold"
                      aria-label={`Term ${index + 1} title`}
                    />
                    <div className="min-w-0 flex-1">
                      <SheetTextarea
                        value={term.text}
                        onChange={(text) => setTerm(index, { text })}
                        placeholder="Term"
                        readOnly={readOnly}
                        error={errors[`terms.${index}.text`]}
                        className={cn(!term.label && 'font-bold')}
                        aria-label={`Term ${index + 1}`}
                      />
                    </div>
                    {canEdit ? (
                      <RowButton
                        label="Remove term"
                        destructive
                        onClick={() =>
                          setValues((current) => ({
                            ...current,
                            terms: current.terms.filter((_, i) => i !== index),
                          }))
                        }
                        className="mt-1 opacity-40 group-hover/term:opacity-100"
                      >
                        <Trash2 />
                      </RowButton>
                    ) : null}
                  </div>
                ))}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      terms: [...current.terms, { label: '', text: '' }],
                    }))
                  }
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium text-brand-600 transition-colors hover:bg-brand-50"
                >
                  <Plus className="size-3.5" />
                  Add term
                </button>
              ) : null}
            </section>

            {/* Letterhead foot */}
            <footer className="mt-10 flex flex-wrap items-start justify-between gap-4 border-t border-ink-500 pt-3">
              <div className="max-w-xs text-[10.5px] leading-relaxed text-ink-700">
                <p className="font-bold">{settings.letterheadName}</p>
                {settings.footerText ? <p>{settings.footerText}</p> : null}
                <p className="whitespace-pre-line">{settings.address}</p>
              </div>
              <div className="flex max-w-[420px] flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {[AFRA_LOGO, BRAND_5, BRAND_8, BRAND_6, BRAND_9, BRAND_7, BRAND_4, BRAND_3].map((logo, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={index} src={logo} alt="" className="h-7 w-auto" />
                ))}
              </div>
            </footer>
          </article>
        </div>

        {/* Versions */}
        <aside className="w-full shrink-0 xl:sticky xl:top-32 xl:w-72">
          <div className="rounded-lg border border-ink-100 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
              <History className="size-4 text-ink-400" />
              <h2 className="text-[13px] font-semibold text-ink-900">Versions</h2>
              <span className="ml-auto text-[12px] text-ink-400">{versions.length}</span>
            </div>

            {versions.length === 0 ? (
              <p className="px-4 py-5 text-[12.5px] leading-relaxed text-ink-500">
                Nothing saved yet. Saving creates {revisionLabel(0)} and gives the quotation its
                reference number.
              </p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto scroll-polished">
                {versions.map((version) => {
                  const current = version.id === selected?.id
                  const edited = version.updatedAt !== version.createdAt
                  return (
                    <li key={version.id} className={cn('px-4 py-3', current && 'bg-brand-50/60')}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openVersion(version.revision)}
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold transition-colors',
                            current
                              ? 'bg-brand-600 text-white'
                              : 'bg-ink-100 text-ink-700 hover:bg-brand-100 hover:text-brand-700',
                          )}
                        >
                          {revisionLabel(version.revision)}
                        </button>
                        {version.id === latest?.id ? (
                          <span className="text-[11px] font-medium text-positive">Latest</span>
                        ) : null}
                        <span className="ml-auto text-[12.5px] font-semibold text-ink-900 tabular">
                          {version.currency} {amountFormat.format(version.totalAmount)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] text-ink-400">
                        {formatDateTime(version.createdAt)}
                        {version.createdBy ? ` · ${version.createdBy.name}` : ''}
                      </p>
                      {edited ? (
                        <p className="text-[11px] text-ink-400">
                          Edited {formatDateTime(version.updatedAt)}
                          {version.updatedBy ? ` · ${version.updatedBy.name}` : ''}
                        </p>
                      ) : null}
                      <div className="mt-2 flex gap-1">
                        {!current ? (
                          <Button variant="ghost" size="xs" onClick={() => void openVersion(version.revision)}>
                            Open
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="xs" asChild>
                          <a href={pdfHref(version.id, false)} target="_blank" rel="noreferrer">
                            <ExternalLink />
                            View
                          </a>
                        </Button>
                        <Button variant="ghost" size="xs" asChild>
                          <a href={pdfHref(version.id, true)}>
                            <Download />
                            Download
                          </a>
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {confirmDialog}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sheet controls                                                            */
/* -------------------------------------------------------------------------- */

/** A peach band across the sheet, as on the issued quotation. */
function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-ink-500 bg-[#FAE2D6] px-2 py-1.5 text-center text-[12.5px] font-bold">
      {children}
    </div>
  )
}

function LabelCell({ children, shaded }: { children: React.ReactNode; shaded?: boolean }) {
  return (
    <td
      className={cn(
        'border border-ink-500 px-2 py-1.5 align-top text-[12px] font-bold',
        shaded && 'bg-[#f8f8f8]',
      )}
    >
      {children}
    </td>
  )
}

function ValueCell({ children, error }: { children: React.ReactNode; error?: string }) {
  return (
    <td className={cn('border border-ink-500 p-0.5 align-top', error && 'bg-negative-soft/50')}>
      {children}
    </td>
  )
}

/**
 * A value the sheet shows but does not take: the sales block comes from the
 * request's sales owner and their user record, and is filled in on save.
 */
function FixedText({ value, placeholder }: { value: string; placeholder?: string }) {
  return (
    <p
      title="Taken from the request's sales owner"
      className={cn('px-1.5 py-1 text-ink-700', !value && 'text-ink-300')}
    >
      {value || placeholder || '—'}
    </p>
  )
}

function HeadCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('border border-ink-500 bg-[#FAE2D6] px-2 py-1.5 font-bold', className)}>
      {children}
    </th>
  )
}

type SheetInputProps = Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
  error?: string
}

/**
 * Text that reads as part of the page until it is pointed at.
 *
 * Borderless on purpose: a sheet of boxed inputs looks like a form, not like
 * the quotation the customer receives. Hover and focus show what is editable.
 */
function SheetInput({ value, onChange, error, readOnly, className, ...props }: SheetInputProps) {
  return (
    <input
      {...props}
      value={value}
      readOnly={readOnly}
      title={error}
      aria-invalid={error ? true : undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'w-full min-w-0 rounded-[4px] border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-ink-900',
        'placeholder:text-ink-300 transition-[border-color,background-color,box-shadow] duration-150',
        !readOnly && 'hover:border-ink-200 hover:bg-white focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/15',
        readOnly && 'cursor-default focus:outline-none',
        error && 'border-negative/70 bg-negative-soft/60',
        className,
      )}
    />
  )
}

type SheetTextareaProps = Omit<React.ComponentProps<'textarea'>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
  error?: string
}

/** A multi-line field that grows with its text rather than scrolling inside the sheet. */
function SheetTextarea({ value, onChange, error, readOnly, className, ...props }: SheetTextareaProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight + 2}px`
  }, [value])

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      readOnly={readOnly}
      title={error}
      aria-invalid={error ? true : undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'block w-full min-w-0 resize-none overflow-hidden rounded-[4px] border border-transparent bg-transparent px-1.5 py-1 text-[13px] leading-snug text-ink-900',
        'placeholder:text-ink-300 transition-[border-color,background-color,box-shadow] duration-150',
        !readOnly && 'hover:border-ink-200 hover:bg-white focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/15',
        readOnly && 'cursor-default focus:outline-none',
        error && 'border-negative/70 bg-negative-soft/60',
        className,
      )}
    />
  )
}

function RowButton({
  label,
  onClick,
  disabled,
  destructive,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'grid size-6 place-items-center rounded text-ink-400 transition-colors [&_svg]:size-3.5',
          'hover:bg-ink-100 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30',
          destructive && 'hover:bg-negative-soft hover:text-negative',
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}
