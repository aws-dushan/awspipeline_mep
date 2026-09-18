import type { EnquiryFormInput } from '@/lib/validation/enquiry'

/**
 * Which fields of a request an administrator may make mandatory.
 *
 * The list is fixed - these are the form's own fields - but whether each one
 * is required is a decision per company, because what a request must carry
 * differs by how a business works.
 *
 * Three fields are not here on purpose. S.No and Job No are issued by the
 * server, and the enquiry date is taken from the clock: none of them is typed,
 * so none can be left out. Customer Name is not here either - a request that
 * names no customer is not a request, and the column it is stored in does not
 * accept nothing.
 */
export type EnquiryFieldKey = Extract<
  keyof EnquiryFormInput,
  | 'salesResponsibleId'
  | 'projectName'
  | 'statusValueId'
  | 'locationValueIds'
  | 'materialValueIds'
  | 'enquiryDetails'
  | 'quoteValue'
  | 'probabilityValueId'
  | 'expectedOrderDate'
  | 'expectedBillingDate'
  | 'email'
  | 'contactPerson'
  | 'phoneNumber'
  | 'remarks'
>

export type ConfigurableField = {
  field: EnquiryFieldKey
  /** As the form labels it, so the setting reads like the screen it governs. */
  label: string
  /** What a company starts with before anyone changes it. */
  defaultRequired: boolean
}

export const CONFIGURABLE_ENQUIRY_FIELDS: readonly ConfigurableField[] = [
  { field: 'salesResponsibleId', label: 'Sales responsible', defaultRequired: true },
  { field: 'projectName', label: 'Project name', defaultRequired: false },
  { field: 'statusValueId', label: 'Status', defaultRequired: true },
  { field: 'locationValueIds', label: 'Locations', defaultRequired: true },
  { field: 'materialValueIds', label: 'Materials', defaultRequired: true },
  { field: 'enquiryDetails', label: 'Enquiry details', defaultRequired: true },
  { field: 'quoteValue', label: 'Quote value', defaultRequired: false },
  { field: 'probabilityValueId', label: 'Probability', defaultRequired: true },
  { field: 'expectedOrderDate', label: 'Expected order date', defaultRequired: false },
  { field: 'expectedBillingDate', label: 'Expected billing date', defaultRequired: false },
  { field: 'email', label: 'Email', defaultRequired: false },
  { field: 'contactPerson', label: 'Contact person', defaultRequired: false },
  { field: 'phoneNumber', label: 'Phone number', defaultRequired: false },
  { field: 'remarks', label: 'Remarks', defaultRequired: false },
]

export const CONFIGURABLE_FIELD_KEYS: readonly EnquiryFieldKey[] =
  CONFIGURABLE_ENQUIRY_FIELDS.map((f) => f.field)

const BY_FIELD = new Map(CONFIGURABLE_ENQUIRY_FIELDS.map((f) => [f.field, f]))

export function isConfigurableField(value: string): value is EnquiryFieldKey {
  return BY_FIELD.has(value as EnquiryFieldKey)
}

export function fieldLabel(field: EnquiryFieldKey): string {
  return BY_FIELD.get(field)?.label ?? field
}

/** The set a company starts with, before an administrator changes anything. */
export const DEFAULT_REQUIRED_FIELDS: ReadonlySet<EnquiryFieldKey> = new Set(
  CONFIGURABLE_ENQUIRY_FIELDS.filter((f) => f.defaultRequired).map((f) => f.field),
)

/**
 * Fold the stored rules over the defaults.
 *
 * A field with no row has never been decided on, so it keeps its default. That
 * is why the absence of a row and a row set to false are not the same thing.
 */
export function resolveRequiredFields(
  rules: { field: string; isRequired: boolean }[],
): Set<EnquiryFieldKey> {
  const required = new Set(DEFAULT_REQUIRED_FIELDS)
  for (const rule of rules) {
    if (!isConfigurableField(rule.field)) continue
    if (rule.isRequired) required.add(rule.field)
    else required.delete(rule.field)
  }
  return required
}
