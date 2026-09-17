/**
 * Development helper: create a company the same way the admin screen does.
 * Not part of the application - used to exercise the pipeline locally.
 */
import { PrismaClient, type DropdownTypeKey } from '@prisma/client'

import { DEFAULT_RULE_PAIRS } from '../src/lib/pipeline/automation'
import { buildDefaultDropdownRows } from '../src/lib/database/dropdown-defaults'

const prisma = new PrismaClient()

async function main() {
  const [, , code = 'AWSD', name = 'AWS Distribution'] = process.argv

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
  const types = await prisma.dropdownType.findMany({ select: { id: true, key: true } })
  const typeIds = Object.fromEntries(types.map((t) => [t.key, t.id])) as Record<DropdownTypeKey, string>

  const existing = await prisma.company.findUnique({ where: { code } })
  if (existing) {
    console.log(`Company ${code} already exists: ${existing.id}`)
    return
  }

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        name,
        code,
        legalName: `${name} LLC`,
        color: '#1E4FD8',
        currency: 'AED',
        counter: { create: { nextSerialNo: 1, nextJobNo: 1261, jobNoPrefix: '' } },
      },
      select: { id: true, name: true },
    })
    await tx.dropdownValue.createMany({ data: buildDefaultDropdownRows(created.id, typeIds) })
    const values = await tx.dropdownValue.findMany({
      where: { companyId: created.id },
      select: { id: true, typeKey: true, label: true },
    })
    const byKey = new Map(values.map((v) => [`${v.typeKey}:${v.label}`, v.id]))
    const rules = DEFAULT_RULE_PAIRS.map((pair, index) => {
      const whenValueId = byKey.get(`${pair.whenType}:${pair.whenLabel}`)
      const thenValueId = byKey.get(`${pair.thenType}:${pair.thenLabel}`)
      if (!whenValueId || !thenValueId) return null
      return {
        companyId: created.id,
        whenType: pair.whenType,
        whenValueId,
        thenType: pair.thenType,
        thenValueId,
        sortOrder: index,
        createdById: admin?.id ?? null,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)
    if (rules.length > 0) await tx.automationRule.createMany({ data: rules, skipDuplicates: true })
    return created
  })

  if (admin) {
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: admin.id, companyId: company.id } },
      create: { userId: admin.id, companyId: company.id, isDefault: true },
      update: {},
    })
  }

  console.log(`Created ${company.name} (${company.id})`)
}

main().finally(() => prisma.$disconnect())
