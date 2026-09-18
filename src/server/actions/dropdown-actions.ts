'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

import { diffRecords, writeAudit } from '@/lib/audit'
import { requireCompanyPermission } from '@/lib/auth/session'
import { DROPDOWN_TYPE_LABELS } from '@/lib/database/dropdown-repository'
import { prisma } from '@/lib/database/prisma'
import {
  getRequiredFields,
  setRequiredFields,
} from '@/lib/database/field-rule-repository'
import { fieldLabel, type EnquiryFieldKey } from '@/lib/pipeline/enquiry-fields'
import { publish } from '@/lib/realtime/event-bus'
import {
  createDropdownValueSchema,
  reorderDropdownSchema,
  requiredFieldsSchema,
  toggleDropdownValueSchema,
  updateDropdownValueSchema,
} from '@/lib/validation/admin'
import {
  ConflictError,
  NotFoundError,
  runAction,
  type ActionResult,
} from '@/server/actions/action-result'

function dropdownPath(companyId: string) {
  return `/c/${companyId}/admin/dropdowns`
}

export async function createDropdownValueAction(
  input: unknown,
): Promise<ActionResult<{ id: string; label: string }>> {
  return runAction('createDropdownValue', async () => {
    const parsed = createDropdownValueSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')

    const type = await prisma.dropdownType.findUnique({
      where: { key: parsed.typeKey },
      select: { id: true },
    })
    if (!type) throw new NotFoundError('Unknown dropdown type.')

    try {
      const created = await prisma.$transaction(async (tx) => {
        const value = await tx.dropdownValue.create({
          data: {
            companyId: company.id,
            typeId: type.id,
            typeKey: parsed.typeKey,
            label: parsed.label,
            color: parsed.color,
            sortOrder: parsed.sortOrder,
            isActive: parsed.isActive,
            numericValue:
              parsed.typeKey === 'PROBABILITY' && parsed.numericValue !== null
                ? new Prisma.Decimal(parsed.numericValue)
                : null,
          },
          select: { id: true, label: true },
        })

        await writeAudit(
          {
            actorId: user.id,
            companyId: company.id,
            action: 'DROPDOWN_VALUE_CREATED',
            entity: 'DROPDOWN_VALUE',
            entityId: value.id,
            summary: `${user.name} added ${DROPDOWN_TYPE_LABELS[parsed.typeKey]} value "${value.label}"`,
            metadata: { typeKey: parsed.typeKey, label: value.label, color: parsed.color },
          },
          tx,
        )

        return value
      })

      revalidatePath(dropdownPath(company.id))
      revalidatePath(`/c/${company.id}/pipeline`)
    publish({ channel: 'dropdowns', companyId: company.id, actorId: user.id, action: 'dropdown.changed' })
      return created
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(
          `A ${DROPDOWN_TYPE_LABELS[parsed.typeKey].toLowerCase()} value named "${parsed.label}" already exists.`,
        )
      }
      throw error
    }
  })
}

export async function updateDropdownValueAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction('updateDropdownValue', async () => {
    const parsed = updateDropdownValueSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')

    const existing = await prisma.dropdownValue.findFirst({
      where: { id: parsed.valueId, companyId: company.id },
      select: {
        id: true,
        label: true,
        color: true,
        sortOrder: true,
        isActive: true,
        numericValue: true,
        typeKey: true,
      },
    })
    if (!existing) throw new NotFoundError('That dropdown value no longer exists.')

    const nextNumeric =
      existing.typeKey === 'PROBABILITY' && parsed.numericValue !== null
        ? parsed.numericValue
        : null

    const changes = diffRecords(
      {
        label: existing.label,
        color: existing.color,
        sortOrder: existing.sortOrder,
        isActive: existing.isActive,
        numericValue: existing.numericValue === null ? null : Number(existing.numericValue),
      },
      {
        label: parsed.label,
        color: parsed.color,
        sortOrder: parsed.sortOrder,
        isActive: parsed.isActive,
        numericValue: nextNumeric,
      },
      [
        { field: 'label', label: 'Label' },
        { field: 'color', label: 'Colour' },
        { field: 'sortOrder', label: 'Display order' },
        { field: 'isActive', label: 'Active' },
        { field: 'numericValue', label: 'Weight' },
      ],
    )

    try {
      await prisma.$transaction(async (tx) => {
        await tx.dropdownValue.update({
          where: { id: existing.id },
          data: {
            label: parsed.label,
            color: parsed.color,
            sortOrder: parsed.sortOrder,
            isActive: parsed.isActive,
            numericValue: nextNumeric === null ? null : new Prisma.Decimal(nextNumeric),
          },
        })

        if (changes.length > 0) {
          await writeAudit(
            {
              actorId: user.id,
              companyId: company.id,
              action: 'DROPDOWN_VALUE_UPDATED',
              entity: 'DROPDOWN_VALUE',
              entityId: existing.id,
              summary: `${user.name} updated ${DROPDOWN_TYPE_LABELS[existing.typeKey]} value "${parsed.label}"`,
              changes,
            },
            tx,
          )
        }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(`A value named "${parsed.label}" already exists.`)
      }
      throw error
    }

    revalidatePath(dropdownPath(company.id))
    revalidatePath(`/c/${company.id}/pipeline`)
    publish({ channel: 'dropdowns', companyId: company.id, actorId: user.id, action: 'dropdown.changed' })
    return { id: existing.id }
  })
}

/**
 * Activate or deactivate a value.
 *
 * Dropdown values are never hard-deleted: historical enquiries point at them,
 * and losing the label would silently rewrite the past. Deactivating removes
 * it from the pickers while every existing record keeps rendering it.
 */
export async function toggleDropdownValueAction(
  input: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean; usageCount: number }>> {
  return runAction('toggleDropdownValue', async () => {
    const parsed = toggleDropdownValueSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')

    const value = await prisma.dropdownValue.findFirst({
      where: { id: parsed.valueId, companyId: company.id },
      select: { id: true, label: true, typeKey: true, isActive: true },
    })
    if (!value) throw new NotFoundError('That dropdown value no longer exists.')

    const usageCount = await prisma.enquiry.count({
      where: {
        companyId: company.id,
        OR: [
          { statusValueId: value.id },
          { probabilityValueId: value.id },
          { locations: { some: { valueId: value.id } } },
          { materials: { some: { valueId: value.id } } },
        ],
      },
    })

    await prisma.$transaction(async (tx) => {
      await tx.dropdownValue.update({
        where: { id: value.id },
        data: { isActive: parsed.isActive },
      })
      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: parsed.isActive ? 'DROPDOWN_VALUE_REACTIVATED' : 'DROPDOWN_VALUE_DEACTIVATED',
          entity: 'DROPDOWN_VALUE',
          entityId: value.id,
          summary: `${user.name} ${parsed.isActive ? 'reactivated' : 'deactivated'} ${
            DROPDOWN_TYPE_LABELS[value.typeKey]
          } value "${value.label}"`,
          metadata: { usageCount },
        },
        tx,
      )
    })

    revalidatePath(dropdownPath(company.id))
    revalidatePath(`/c/${company.id}/pipeline`)
    publish({ channel: 'dropdowns', companyId: company.id, actorId: user.id, action: 'dropdown.changed' })
    return { id: value.id, isActive: parsed.isActive, usageCount }
  })
}

export async function reorderDropdownValuesAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction('reorderDropdownValues', async () => {
    const parsed = reorderDropdownSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')

    // Only reorder ids that genuinely belong to this company and type.
    const owned = await prisma.dropdownValue.findMany({
      where: { id: { in: parsed.orderedIds }, companyId: company.id, typeKey: parsed.typeKey },
      select: { id: true },
    })
    const ownedIds = new Set(owned.map((value) => value.id))

    await prisma.$transaction(
      parsed.orderedIds
        .filter((id) => ownedIds.has(id))
        .map((id, index) =>
          prisma.dropdownValue.update({ where: { id }, data: { sortOrder: index } }),
        ),
    )

    revalidatePath(dropdownPath(company.id))
    revalidatePath(`/c/${company.id}/pipeline`)
    publish({ channel: 'dropdowns', companyId: company.id, actorId: user.id, action: 'dropdown.changed' })
    return { count: ownedIds.size }
  })
}

/**
 * Set which fields a request must carry.
 *
 * The whole set is written each time rather than a delta: the screen sends
 * what it shows, and a decision per field means a later change to a built-in
 * default cannot silently re-require something an administrator turned off.
 */
export async function setRequiredFieldsAction(
  input: unknown,
): Promise<ActionResult<{ required: string[] }>> {
  return runAction('setRequiredFields', async () => {
    const parsed = requiredFieldsSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')

    const before = await getRequiredFields(company.id)
    const after = await setRequiredFields(company.id, parsed.fields)

    const added = [...after].filter((field) => !before.has(field))
    const removed = [...before].filter((field) => !after.has(field))

    if (added.length > 0 || removed.length > 0) {
      const describe = (fields: EnquiryFieldKey[]) =>
        fields.map((field) => fieldLabel(field)).join(', ')
      const parts = [
        added.length > 0 ? `made ${describe(added)} mandatory` : null,
        removed.length > 0 ? `made ${describe(removed)} optional` : null,
      ].filter(Boolean)

      await writeAudit({
        actorId: user.id,
        companyId: company.id,
        action: 'REQUIRED_FIELDS_CHANGED',
        entity: 'ENQUIRY_FIELD_RULE',
        entityId: company.id,
        summary: `${user.name} ${parts.join(' and ')}`,
        metadata: { required: [...after] },
      })
    }

    revalidatePath(`/c/${company.id}/admin/dropdowns`)
    revalidatePath(`/c/${company.id}/pipeline`)
    return { required: [...after] }
  })
}
