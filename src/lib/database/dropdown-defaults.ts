import { DropdownTypeKey, type Prisma } from '@prisma/client'

/**
 * Starter dropdown values applied to a newly created company.
 *
 * These are a convenience only. Nothing in the application logic depends on
 * these labels existing or meaning anything in particular - an admin is free
 * to rename, recolour, reorder, deactivate or replace every one of them.
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
  LOCATION: [
    { label: 'DXB', color: '#0EA5E9' },
    { label: 'SHJ', color: '#14B8A6' },
    { label: 'AUH', color: '#6366F1' },
    { label: 'AJM', color: '#F59E0B' },
    { label: 'RAK', color: '#EC4899' },
    { label: 'UAQ', color: '#8B5CF6' },
    { label: 'FUJ', color: '#10B981' },
    { label: 'AIN', color: '#F97316' },
  ],
  MATERIAL: [
    { label: 'AC', color: '#0EA5E9' },
    { label: 'MEP', color: '#6366F1' },
    { label: 'PPR', color: '#14B8A6' },
    { label: 'Electrical', color: '#F59E0B' },
    { label: 'LED Lights', color: '#EAB308' },
    { label: 'ELV', color: '#8B5CF6' },
    { label: 'Sanitary Wares', color: '#06B6D4' },
    { label: 'Pumps', color: '#EC4899' },
    { label: 'Generators', color: '#64748B' },
  ],
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
