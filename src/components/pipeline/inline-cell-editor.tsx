'use client'

import * as React from 'react'

import type { FilterOptions } from '@/components/pipeline/filters/column-filter'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import type { PipelineColumn } from '@/lib/pipeline/columns'
import type { EnquiryFormInput } from '@/lib/validation/enquiry'

export type DraftPatch = Partial<EnquiryFormInput>

/**
 * One cell of a row being edited in place.
 *
 * Every control is the compact variant and fills its cell exactly, because the
 * column widths do not change when a row enters edit mode - a grid that
 * reflowed on double-click would move every other row out from under the
 * pointer.
 *
 * Two columns have no editor. Job No is issued by the server from the
 * company's counter, and letting it be typed over would break the guarantee
 * that it is unique within a company. The enquiry date records when the
 * request came in, which is not something a later edit gets to revise.
 */
export function InlineCellEditor({
  column,
  draft,
  options,
  currency,
  invalid,
  autoFocus,
  onPatch,
}: {
  column: PipelineColumn
  draft: EnquiryFormInput
  options: FilterOptions
  currency: string
  invalid: boolean
  autoFocus?: boolean
  onPatch: (patch: DraftPatch) => void
}) {
  /*
   * Focus without scrolling.
   *
   * React's `autoFocus` calls plain `.focus()`, which brings the element into
   * view - and in a horizontally scrolled grid that means jumping to wherever
   * the cell happens to be. The cell here is the one under the pointer, so it
   * is already visible and the scroll must not move at all. Once per mount,
   * not once per render, or every keystroke would reselect the text.
   */
  const focusRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const claimed = React.useRef(false)
  React.useEffect(() => {
    if (!autoFocus || claimed.current) return
    claimed.current = true
    focusRef.current?.focus({ preventScroll: true })
    focusRef.current?.select()
  }, [autoFocus])

  // One ref for two element types, so the callback narrows what the object
  // form cannot.
  const takeFocus = autoFocus
    ? (element: HTMLInputElement | HTMLTextAreaElement | null) => {
        focusRef.current = element
      }
    : undefined

  const text = (key: keyof EnquiryFormInput, extra?: React.ComponentProps<typeof Input>) => (
    <Input
      ref={takeFocus}
      className="h-8 w-full text-[13px]"
      invalid={invalid}
      value={String(draft[key] ?? '')}
      onChange={(event) => onPatch({ [key]: event.target.value } as DraftPatch)}
      {...extra}
    />
  )

  const picker = (
    key: keyof EnquiryFormInput,
    list: FilterOptions[keyof FilterOptions],
    placeholder: string,
  ) => (
    <Combobox
      compact
      invalid={invalid}
      options={list}
      value={(draft[key] as string) || null}
      placeholder={placeholder}
      onChange={(value) => onPatch({ [key]: value ?? '' } as DraftPatch)}
    />
  )

  const date = (key: keyof EnquiryFormInput) => (
    <DatePicker
      compact
      invalid={invalid}
      value={String(draft[key] ?? '')}
      onChange={(value) => onPatch({ [key]: value ?? '' } as DraftPatch)}
    />
  )

  /*
   * Free text that people write paragraphs into. One row tall by default so
   * the grid keeps its rhythm, but it scrolls and accepts line breaks - Enter
   * inserts one here rather than saving the row.
   */
  const longText = (key: keyof EnquiryFormInput, placeholder?: string) => (
    <Textarea
      ref={takeFocus}
      rows={1}
      placeholder={placeholder}
      className="h-8 min-h-8 w-full resize-none py-1.5 text-[13px] leading-snug"
      invalid={invalid}
      value={String(draft[key] ?? '')}
      onChange={(event) => onPatch({ [key]: event.target.value } as DraftPatch)}
    />
  )

  switch (column.key) {
    case 'jobNo':
    case 'enquiryDate':
      return null

    case 'expectedOrderDate':
      return date('expectedOrderDate')
    case 'expectedBillingDate':
      return date('expectedBillingDate')

    case 'salesResponsible':
      return picker('salesResponsibleId', options.users, 'Select a person')
    case 'status':
      return picker('statusValueId', options.status, 'Select status')
    case 'location':
      return picker('locationValueId', options.location, 'Select location')
    case 'material':
      return picker('materialValueId', options.material, 'Select material')
    case 'probability':
      return picker('probabilityValueId', options.probability, 'Select probability')

    case 'customerName':
      return (
        <Combobox
          compact
          invalid={invalid}
          options={options.customers}
          // Matched by name, because a saved request keeps the customer's name
          // rather than an id the row can hand back.
          value={
            options.customers.find(
              (option) =>
                option.label.trim().toLowerCase() ===
                String(draft.customerName ?? '').trim().toLowerCase(),
            )?.value ?? null
          }
          placeholder={String(draft.customerName || 'Select a customer')}
          onChange={(value) => {
            const option = options.customers.find((candidate) => candidate.value === value)
            if (!option) return
            onPatch({ customerId: option.value, customerName: option.label })
          }}
        />
      )

    case 'quoteValue':
      return text('quoteValue', {
        inputMode: 'decimal',
        className: 'h-8 w-full text-right tabular text-[13px]',
        placeholder: currency,
      })

    case 'email':
      return text('email', { type: 'email', autoComplete: 'off' })

    case 'projectName':
      return text('projectName')
    case 'phoneNumber':
      return text('phoneNumber')

    case 'enquiryDetails':
      return longText('enquiryDetails')
    case 'remarks':
      return longText('remarks')

    default:
      return null
  }
}

/** Which form field a column edits, for mapping validation errors onto cells. */
export const FIELD_BY_COLUMN: Partial<Record<PipelineColumn['key'], keyof EnquiryFormInput>> = {
  salesResponsible: 'salesResponsibleId',
  customerName: 'customerName',
  projectName: 'projectName',
  status: 'statusValueId',
  location: 'locationValueId',
  material: 'materialValueId',
  enquiryDetails: 'enquiryDetails',
  quoteValue: 'quoteValue',
  probability: 'probabilityValueId',
  expectedOrderDate: 'expectedOrderDate',
  expectedBillingDate: 'expectedBillingDate',
  email: 'email',
  phoneNumber: 'phoneNumber',
  remarks: 'remarks',
}
