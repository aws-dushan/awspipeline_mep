import 'server-only'

import type { DropdownTypeKey, Prisma } from '@prisma/client'

import { prisma } from '@/lib/database/prisma'
import {
  applyAutomationRules,
  DEFAULT_RULE_PAIRS,
  type AutomationRule,
  type DropdownSelection,
} from '@/lib/pipeline/automation'

export async function getAutomationRules(
  companyId: string,
  options: { includeInactive?: boolean } = {},
): Promise<AutomationRule[]> {
  const rules = await prisma.automationRule.findMany({
    relationLoadStrategy: 'join',
    where: { companyId, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      whenType: true,
      whenValueId: true,
      thenType: true,
      thenValueId: true,
      isActive: true,
      whenValue: { select: { label: true } },
      thenValue: { select: { label: true } },
    },
  })

  return rules.map((rule) => ({
    id: rule.id,
    whenType: rule.whenType,
    whenValueId: rule.whenValueId,
    thenType: rule.thenType,
    thenValueId: rule.thenValueId,
    isActive: rule.isActive,
    whenLabel: rule.whenValue.label,
    thenLabel: rule.thenValue.label,
  }))
}

/**
 * Re-run the automation rules server-side before writing.
 *
 * The drawer already applied them for feedback, but a crafted request could
 * post a Status of "Won" with a 25% probability. This is the authority.
 */
export async function enforceAutomationRules(options: {
  companyId: string
  selection: DropdownSelection
  previous?: DropdownSelection
}): Promise<DropdownSelection> {
  const rules = await getAutomationRules(options.companyId)
  if (rules.length === 0) return options.selection

  // Replay the rules for each dropdown field the caller actually changed, so
  // an untouched record is never rewritten behind the user's back.
  const previous = options.previous ?? {}
  const changedTypes = (Object.keys(options.selection) as DropdownTypeKey[]).filter(
    (type) => options.selection[type] !== (previous[type] ?? null),
  )

  let selection = options.selection
  for (const type of changedTypes) {
    selection = applyAutomationRules(selection, rules, type).selection
  }
  return selection
}

/**
 * Seed the default Status/Probability linkage for a company.
 *
 * Resolves the rule pairs against that company's own dropdown values by label,
 * and silently skips any pair whose values the admin has renamed or removed -
 * a starter convenience must never block company creation.
 */
export async function seedDefaultAutomationRules(
  tx: Prisma.TransactionClient,
  companyId: string,
  createdById: string | null,
): Promise<number> {
  const values = await tx.dropdownValue.findMany({
    where: { companyId },
    select: { id: true, typeKey: true, label: true },
  })

  const byKey = new Map(values.map((value) => [`${value.typeKey}:${value.label}`, value.id]))
  const rows: Prisma.AutomationRuleCreateManyInput[] = []

  DEFAULT_RULE_PAIRS.forEach((pair, index) => {
    const whenValueId = byKey.get(`${pair.whenType}:${pair.whenLabel}`)
    const thenValueId = byKey.get(`${pair.thenType}:${pair.thenLabel}`)
    if (!whenValueId || !thenValueId) return
    rows.push({
      companyId,
      whenType: pair.whenType,
      whenValueId,
      thenType: pair.thenType,
      thenValueId,
      sortOrder: index,
      isActive: true,
      createdById,
    })
  })

  if (rows.length === 0) return 0
  const result = await tx.automationRule.createMany({ data: rows, skipDuplicates: true })
  return result.count
}
