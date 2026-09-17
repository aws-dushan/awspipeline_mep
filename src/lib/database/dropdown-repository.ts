import 'server-only'

import { DropdownTypeKey } from '@prisma/client'

import { prisma } from '@/lib/database/prisma'

export type DropdownOption = {
  id: string
  label: string
  color: string | null
  sortOrder: number
  isActive: boolean
  numericValue: number | null
  isDefault: boolean
}

export type DropdownCatalogue = Record<DropdownTypeKey, DropdownOption[]>

export const DROPDOWN_TYPE_LABELS: Record<DropdownTypeKey, string> = {
  STATUS: 'Status',
  LOCATION: 'Location',
  MATERIAL: 'Material',
  PROBABILITY: 'Probability',
}

export const DROPDOWN_TYPE_DESCRIPTIONS: Record<DropdownTypeKey, string> = {
  STATUS: 'Where the enquiry currently sits in the sales cycle.',
  LOCATION: 'Emirate or site the enquiry relates to.',
  MATERIAL: 'Product or trade category being quoted.',
  PROBABILITY: 'Likelihood of winning. The numeric weight drives the weighted pipeline value.',
}

const EMPTY_CATALOGUE = (): DropdownCatalogue => ({
  STATUS: [],
  LOCATION: [],
  MATERIAL: [],
  PROBABILITY: [],
})

function serialize(value: {
  id: string
  label: string
  color: string | null
  sortOrder: number
  isActive: boolean
  numericValue: unknown
  isDefault: boolean
}): DropdownOption {
  return {
    id: value.id,
    label: value.label,
    color: value.color,
    sortOrder: value.sortOrder,
    isActive: value.isActive,
    numericValue: value.numericValue === null ? null : Number(value.numericValue),
    isDefault: value.isDefault,
  }
}

/**
 * All dropdown values for a company, grouped by type.
 *
 * `includeInactive` is what lets a historical row keep rendering the value it
 * was saved with after an admin retires that value - retired values are never
 * deleted, only deactivated, so old records never lose meaning.
 */
export async function getDropdownCatalogue(
  companyId: string,
  options: { includeInactive?: boolean } = {},
): Promise<DropdownCatalogue> {
  const values = await prisma.dropdownValue.findMany({
    where: {
      companyId,
      ...(options.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ typeKey: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    select: {
      id: true,
      typeKey: true,
      label: true,
      color: true,
      sortOrder: true,
      isActive: true,
      numericValue: true,
      isDefault: true,
    },
  })

  const catalogue = EMPTY_CATALOGUE()
  for (const value of values) {
    catalogue[value.typeKey].push(serialize(value))
  }
  return catalogue
}

/**
 * Validate that a dropdown value belongs to this company and this field.
 *
 * Without this, a crafted request could point a company's enquiry at another
 * company's dropdown value and leak its label across the tenant boundary.
 */
export async function assertDropdownValue(
  companyId: string,
  typeKey: DropdownTypeKey,
  valueId: string | null,
): Promise<void> {
  if (!valueId) return
  const value = await prisma.dropdownValue.findFirst({
    where: { id: valueId, companyId, typeKey },
    select: { id: true, isActive: true },
  })
  if (!value) {
    throw new Error(`Invalid ${DROPDOWN_TYPE_LABELS[typeKey].toLowerCase()} selection.`)
  }
}

export async function assertDropdownSelections(
  companyId: string,
  selections: Partial<Record<DropdownTypeKey, string | null>>,
): Promise<void> {
  await Promise.all(
    (Object.entries(selections) as [DropdownTypeKey, string | null][]).map(([typeKey, valueId]) =>
      assertDropdownValue(companyId, typeKey, valueId),
    ),
  )
}

export async function getDropdownUsageCounts(
  companyId: string,
): Promise<Map<string, number>> {
  const [status, location, material, probability] = await Promise.all([
    prisma.enquiry.groupBy({ by: ['statusValueId'], where: { companyId }, _count: true }),
    prisma.enquiry.groupBy({ by: ['locationValueId'], where: { companyId }, _count: true }),
    prisma.enquiry.groupBy({ by: ['materialValueId'], where: { companyId }, _count: true }),
    prisma.enquiry.groupBy({ by: ['probabilityValueId'], where: { companyId }, _count: true }),
  ])

  const counts = new Map<string, number>()
  const add = (id: string | null, count: number) => {
    if (!id) return
    counts.set(id, (counts.get(id) ?? 0) + count)
  }

  for (const row of status) add(row.statusValueId, row._count)
  for (const row of location) add(row.locationValueId, row._count)
  for (const row of material) add(row.materialValueId, row._count)
  for (const row of probability) add(row.probabilityValueId, row._count)

  return counts
}

/** Users selectable as "Sales Responsible" within a company. */
export async function getCompanyMembers(companyId: string) {
  const members = await prisma.userCompany.findMany({
    where: { companyId, user: { isActive: true } },
    orderBy: { user: { name: 'asc' } },
    select: {
      user: {
        select: { id: true, name: true, displayCode: true, avatarColor: true, role: true },
      },
    },
  })
  return members.map((member) => member.user)
}
