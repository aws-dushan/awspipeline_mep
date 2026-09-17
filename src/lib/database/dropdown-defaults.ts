import { DropdownTypeKey, type Prisma } from '@prisma/client'

/**
 * Starter dropdown values applied to a newly created company.
 *
 * Status and Probability are standard across every company, so they ship
 * populated and identical - together with the automation rules that link
 * them, which reference these labels by name.
 *
 * Location and Material are deliberately empty: they differ by company and
 * by trade, so guessing at them leaves an admin deleting entries that were
 * never wanted. The company starts with none and its own are added as needed.
 *
 * Nothing in the application logic depends on any of these labels existing -
 * all of it can be renamed, recoloured, reordered or deactivated.
 */

export type DefaultDropdownValue = {
  label: string
  color: string | null
  numericValue?: number
  isDefault?: boolean
}

export const DEFAULT_DROPDOWN_VALUES: Record<DropdownTypeKey, DefaultDropdownValue[]> = {
  STATUS: [
    { label: 'Pending', color: '#D97706', isDefault: true },
    { label: 'Quoted', color: '#2563EB' },
    { label: 'Negotiation', color: '#7C3AED' },
    { label: 'Won', color: '#059669' },
    { label: 'Lost', color: '#DC2626' },
    { label: 'No Stock', color: '#64748B' },
  ],
  LOCATION: [],
  MATERIAL: [],
  PROBABILITY: [
    { label: '0%', color: '#94A3B8', numericValue: 0 },
    { label: '25%', color: '#F59E0B', numericValue: 25 },
    { label: '50%', color: '#3B82F6', numericValue: 50 },
    { label: '75%', color: '#8B5CF6', numericValue: 75 },
    { label: '100%', color: '#059669', numericValue: 100 },
  ],
}

export const DROPDOWN_TYPE_SEED: {
  key: DropdownTypeKey
  label: string
  description: string
}[] = [
  { key: 'STATUS', label: 'Status', description: 'Stage of the enquiry in the sales cycle.' },
  { key: 'LOCATION', label: 'Location', description: 'Emirate or site for the enquiry.' },
  { key: 'MATERIAL', label: 'Material', description: 'Product or trade category quoted.' },
  {
    key: 'PROBABILITY',
    label: 'Probability',
    description: 'Likelihood of winning, weighting the pipeline value.',
  },
]

/**
 * Build the `createMany` payload that gives a new company its starter values.
 * `typeIds` maps each dropdown type key to its row id.
 */
export function buildDefaultDropdownRows(
  companyId: string,
  typeIds: Record<DropdownTypeKey, string>,
): Prisma.DropdownValueCreateManyInput[] {
  const rows: Prisma.DropdownValueCreateManyInput[] = []

  for (const [key, values] of Object.entries(DEFAULT_DROPDOWN_VALUES) as [
    DropdownTypeKey,
    DefaultDropdownValue[],
  ][]) {
    values.forEach((value, index) => {
      rows.push({
        companyId,
        typeId: typeIds[key],
        typeKey: key,
        label: value.label,
        color: value.color,
        sortOrder: index,
        isActive: true,
        isDefault: value.isDefault ?? false,
        numericValue: value.numericValue ?? null,
      })
    })
  }

  return rows
}
