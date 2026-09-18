import 'server-only'

import { prisma } from '@/lib/database/prisma'
import {
  CONFIGURABLE_FIELD_KEYS,
  isConfigurableField,
  resolveRequiredFields,
  type EnquiryFieldKey,
} from '@/lib/pipeline/enquiry-fields'

/** Which fields this company insists on, defaults folded in. */
export async function getRequiredFields(companyId: string): Promise<Set<EnquiryFieldKey>> {
  const rules = await prisma.enquiryFieldRule.findMany({
    where: { companyId },
    select: { field: true, isRequired: true },
  })
  return resolveRequiredFields(rules)
}

/**
 * Replace a company's rules with exactly this set.
 *
 * Written as one decision per configurable field rather than only the ones
 * that differ from the default, so a later change to a default cannot silently
 * re-require a field an administrator has turned off.
 */
export async function setRequiredFields(
  companyId: string,
  required: string[],
): Promise<Set<EnquiryFieldKey>> {
  const wanted = new Set(required.filter(isConfigurableField))

  await prisma.$transaction(async (tx) => {
    await tx.enquiryFieldRule.deleteMany({ where: { companyId } })
    await tx.enquiryFieldRule.createMany({
      data: [...CONFIGURABLE_FIELD_KEYS].map((field) => ({
        companyId,
        field,
        isRequired: wanted.has(field),
      })),
    })
  })

  return wanted
}
