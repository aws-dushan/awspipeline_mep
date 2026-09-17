'use server'

import { revalidatePath } from 'next/cache'
import { DropdownTypeKey, Prisma } from '@prisma/client'
import { z } from 'zod'

import { writeAudit } from '@/lib/audit'
import { requireCompanyPermission } from '@/lib/auth/session'
import { getAutomationRules } from '@/lib/database/automation-repository'
import { prisma } from '@/lib/database/prisma'
import { describeRule } from '@/lib/pipeline/automation'
import { publish } from '@/lib/realtime/event-bus'
import {
  ConflictError,
  NotFoundError,
  runAction,
  type ActionResult,
} from '@/server/actions/action-result'

const ruleSchema = z.object({
  companyId: z.string().min(1),
  whenType: z.nativeEnum(DropdownTypeKey),
  whenValueId: z.string().min(1, 'Choose the trigger value'),
  thenType: z.nativeEnum(DropdownTypeKey),
  thenValueId: z.string().min(1, 'Choose the value to set'),
  isActive: z.coerce.boolean().default(true),
})

const createRuleSchema = ruleSchema.refine((data) => data.whenType !== data.thenType, {
  message: 'A rule must link two different fields',
  path: ['thenType'],
})

const updateRuleSchema = ruleSchema
  .extend({ ruleId: z.string().min(1) })
  .refine((data) => data.whenType !== data.thenType, {
    message: 'A rule must link two different fields',
    path: ['thenType'],
  })

const deleteRuleSchema = z.object({
  companyId: z.string().min(1),
  ruleId: z.string().min(1),
})

const toggleRuleSchema = deleteRuleSchema.extend({ isActive: z.coerce.boolean() })

function settingsPath(companyId: string) {
  return `/c/${companyId}/admin/dropdowns`
}

/** Both dropdown values must belong to this company and to the stated field. */
async function assertRuleValues(
  companyId: string,
  parts: { whenType: DropdownTypeKey; whenValueId: string; thenType: DropdownTypeKey; thenValueId: string },
) {
  const values = await prisma.dropdownValue.findMany({
    where: { companyId, id: { in: [parts.whenValueId, parts.thenValueId] } },
    select: { id: true, typeKey: true, label: true },
  })
  const whenValue = values.find((value) => value.id === parts.whenValueId)
  const thenValue = values.find((value) => value.id === parts.thenValueId)

  if (!whenValue || whenValue.typeKey !== parts.whenType) {
    throw new NotFoundError('The trigger value is not valid for that field.')
  }
  if (!thenValue || thenValue.typeKey !== parts.thenType) {
    throw new NotFoundError('The target value is not valid for that field.')
  }
  return { whenLabel: whenValue.label, thenLabel: thenValue.label }
}

export async function listAutomationRulesAction(companyId: string) {
  return runAction('listAutomationRules', async () => {
    const { company } = await requireCompanyPermission(companyId, 'dropdown:view')
    return getAutomationRules(company.id, { includeInactive: true })
  })
}

export async function createAutomationRuleAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction('createAutomationRule', async () => {
    const parsed = createRuleSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')
    const labels = await assertRuleValues(company.id, parsed)

    try {
      const created = await prisma.$transaction(async (tx) => {
        const count = await tx.automationRule.count({ where: { companyId: company.id } })
        const rule = await tx.automationRule.create({
          data: {
            companyId: company.id,
            whenType: parsed.whenType,
            whenValueId: parsed.whenValueId,
            thenType: parsed.thenType,
            thenValueId: parsed.thenValueId,
            isActive: parsed.isActive,
            sortOrder: count,
            createdById: user.id,
          },
          select: { id: true },
        })

        await writeAudit(
          {
            actorId: user.id,
            companyId: company.id,
            action: 'AUTOMATION_RULE_CREATED',
            entity: 'AUTOMATION_RULE',
            entityId: rule.id,
            summary: `${user.name} added automation: ${describeRule({ ...parsed, ...labels })}`,
            metadata: { ...labels },
          },
          tx,
        )

        return rule
      })

      revalidatePath(settingsPath(company.id))
      publish({
        channel: 'dropdowns',
        companyId: company.id,
        actorId: user.id,
        action: 'automation.changed',
      })
      return created
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(
          `A rule for "${labels.whenLabel}" already sets that field. Edit the existing rule instead.`,
        )
      }
      throw error
    }
  })
}

export async function updateAutomationRuleAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction('updateAutomationRule', async () => {
    const parsed = updateRuleSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')
    const labels = await assertRuleValues(company.id, parsed)

    const existing = await prisma.automationRule.findFirst({
      where: { id: parsed.ruleId, companyId: company.id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundError('That rule no longer exists.')

    try {
      await prisma.$transaction(async (tx) => {
        await tx.automationRule.update({
          where: { id: existing.id },
          data: {
            whenType: parsed.whenType,
            whenValueId: parsed.whenValueId,
            thenType: parsed.thenType,
            thenValueId: parsed.thenValueId,
            isActive: parsed.isActive,
          },
        })
        await writeAudit(
          {
            actorId: user.id,
            companyId: company.id,
            action: 'AUTOMATION_RULE_UPDATED',
            entity: 'AUTOMATION_RULE',
            entityId: existing.id,
            summary: `${user.name} updated automation: ${describeRule({ ...parsed, ...labels })}`,
          },
          tx,
        )
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Another rule already links those two values.')
      }
      throw error
    }

    revalidatePath(settingsPath(company.id))
    publish({
      channel: 'dropdowns',
      companyId: company.id,
      actorId: user.id,
      action: 'automation.changed',
    })
    return { id: existing.id }
  })
}

export async function toggleAutomationRuleAction(
  input: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  return runAction('toggleAutomationRule', async () => {
    const parsed = toggleRuleSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')

    const rule = await prisma.automationRule.findFirst({
      where: { id: parsed.ruleId, companyId: company.id },
      select: {
        id: true,
        whenType: true,
        thenType: true,
        whenValue: { select: { label: true } },
        thenValue: { select: { label: true } },
      },
    })
    if (!rule) throw new NotFoundError('That rule no longer exists.')

    await prisma.$transaction(async (tx) => {
      await tx.automationRule.update({
        where: { id: rule.id },
        data: { isActive: parsed.isActive },
      })
      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'AUTOMATION_RULE_UPDATED',
          entity: 'AUTOMATION_RULE',
          entityId: rule.id,
          summary: `${user.name} ${parsed.isActive ? 'enabled' : 'disabled'} automation: ${describeRule({
            whenType: rule.whenType,
            thenType: rule.thenType,
            whenLabel: rule.whenValue.label,
            thenLabel: rule.thenValue.label,
          })}`,
        },
        tx,
      )
    })

    revalidatePath(settingsPath(company.id))
    publish({
      channel: 'dropdowns',
      companyId: company.id,
      actorId: user.id,
      action: 'automation.changed',
    })
    return { id: rule.id, isActive: parsed.isActive }
  })
}

export async function deleteAutomationRuleAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction('deleteAutomationRule', async () => {
    const parsed = deleteRuleSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'dropdown:manage')

    const rule = await prisma.automationRule.findFirst({
      where: { id: parsed.ruleId, companyId: company.id },
      select: {
        id: true,
        whenType: true,
        thenType: true,
        whenValue: { select: { label: true } },
        thenValue: { select: { label: true } },
      },
    })
    if (!rule) throw new NotFoundError('That rule no longer exists.')

    await prisma.$transaction(async (tx) => {
      await tx.automationRule.delete({ where: { id: rule.id } })
      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'AUTOMATION_RULE_DELETED',
          entity: 'AUTOMATION_RULE',
          entityId: rule.id,
          summary: `${user.name} removed automation: ${describeRule({
            whenType: rule.whenType,
            thenType: rule.thenType,
            whenLabel: rule.whenValue.label,
            thenLabel: rule.thenValue.label,
          })}`,
        },
        tx,
      )
    })

    revalidatePath(settingsPath(company.id))
    publish({
      channel: 'dropdowns',
      companyId: company.id,
      actorId: user.id,
      action: 'automation.changed',
    })
    return { id: rule.id }
  })
}
