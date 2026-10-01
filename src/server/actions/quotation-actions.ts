'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

import { diffRecords, writeAudit, type FieldChange } from '@/lib/audit'
import {
  AuthorizationError,
  requireCompanyAccess,
  requireCompanyPermission,
} from '@/lib/auth/session'
import { prisma } from '@/lib/database/prisma'
import {
  getQuotationSettings,
  settingsCreateData,
} from '@/lib/database/quotation-repository'
import { formatCurrency, parseCalendarDate } from '@/lib/format'
import { canEditEnquiry } from '@/lib/permissions'
import {
  DEFAULT_QUOTATION_SETTINGS,
  quotationTotal,
  revisionLabel,
  saveQuotationSchema,
  updateQuotationSettingsSchema,
  type QuotationFormValues,
  type QuotationSettingsValues,
} from '@/lib/quotation/quotation'
import { publishPipelineChange } from '@/lib/realtime/event-bus'
import {
  ConflictError,
  NotFoundError,
  runAction,
  type ActionResult,
} from '@/server/actions/action-result'

export type SaveQuotationResult = {
  versionId: string
  revision: number
  referenceNo: string
  created: 'quotation' | 'version' | 'updated'
  /** True when the request's Quote Value moved to follow this version. */
  quoteValueUpdated: boolean
}

function versionData(values: QuotationFormValues, currency: string) {
  return {
    quotationDate: parseCalendarDate(values.quotationDate) ?? new Date(),
    validUntil: parseCalendarDate(values.validUntil),
    salesName: values.salesName,
    salesPhone: values.salesPhone,
    salesEmail: values.salesEmail,
    customerName: values.customerName,
    attention: values.attention,
    attentionPhone: values.attentionPhone,
    customerAddress: values.customerAddress,
    customerEmail: values.customerEmail,
    customerRef: values.customerRef,
    enquiryDate: parseCalendarDate(values.enquiryDate),
    items: values.items as unknown as Prisma.InputJsonValue,
    scopeOfWork: values.scopeOfWork,
    vatNote: values.vatNote,
    terms: values.terms as unknown as Prisma.InputJsonValue,
    currency,
    totalAmount: quotationTotal(values.items),
  }
}

/**
 * Take the next reference number for a company.
 *
 * The counter lives on the settings row, so the row is created from the
 * defaults the first time a company issues a quotation. An administrator can
 * move the counter, including backwards; a number already in use is skipped
 * rather than issued twice.
 */
async function allocateReference(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  await tx.quotationSettings.upsert({
    where: { companyId },
    create: settingsCreateData(companyId, DEFAULT_QUOTATION_SETTINGS),
    update: {},
  })

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const settings = await tx.quotationSettings.update({
      where: { companyId },
      data: { nextReferenceNo: { increment: 1 } },
      select: { referencePrefix: true, nextReferenceNo: true },
    })
    const referenceNo = `${settings.referencePrefix}${settings.nextReferenceNo - 1}`
    const taken = await tx.quotation.findFirst({
      where: { companyId, referenceNo },
      select: { id: true },
    })
    if (!taken) return referenceNo
  }
  throw new ConflictError('Could not allocate a free quotation reference. Check the numbering in quotation settings.')
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * Save a quotation.
 *
 * - The first save creates the quotation, its reference and R0.
 * - `new-version` adds the next revision; the version being shown is left
 *   exactly as it was, so what a customer was sent can always be reproduced.
 * - `update-version` corrects the version being shown in place.
 *
 * Whenever the version saved is the latest one, the request's Quote Value is
 * set to its total, so the pipeline always shows the current offer.
 */
export async function saveQuotationAction(input: unknown): Promise<ActionResult<SaveQuotationResult>> {
  return runAction('saveQuotation', async () => {
    const parsed = saveQuotationSchema.parse(input)
    const { user, company } = await requireCompanyAccess(parsed.companyId)

    const enquiry = await prisma.enquiry.findFirst({
      where: { id: parsed.enquiryId, companyId: company.id, isDeleted: false },
      select: {
        id: true,
        jobNo: true,
        customerName: true,
        quoteValue: true,
        createdById: true,
        salesResponsibleId: true,
      },
    })
    if (!enquiry) throw new NotFoundError('That request could not be found.')
    if (!canEditEnquiry(user, enquiry)) {
      throw new AuthorizationError('You can view this quotation but not change it.')
    }

    const values = parsed.data
    const data = versionData(values, company.currency)
    const total = data.totalAmount

    let result: SaveQuotationResult & { previousQuoteValue: number | null }
    try {
      result = await prisma.$transaction(async (tx) => {
        const existing = await tx.quotation.findUnique({
          where: { enquiryId: enquiry.id },
          select: {
            id: true,
            referenceNo: true,
            versions: { select: { id: true, revision: true }, orderBy: { revision: 'desc' } },
          },
        })

        let saved: { id: string; revision: number }
        let referenceNo: string
        let created: SaveQuotationResult['created']
        let isLatest: boolean

        if (!existing) {
          referenceNo = await allocateReference(tx, company.id)
          const quotation = await tx.quotation.create({
            data: {
              companyId: company.id,
              enquiryId: enquiry.id,
              referenceNo,
              createdById: user.id,
              versions: {
                create: { revision: 0, ...data, createdById: user.id, updatedById: user.id },
              },
            },
            select: { id: true, versions: { select: { id: true, revision: true } } },
          })
          saved = quotation.versions[0]
          created = 'quotation'
          isLatest = true

          await writeAudit(
            {
              actorId: user.id,
              companyId: company.id,
              action: 'QUOTATION_CREATED',
              entity: 'QUOTATION',
              entityId: quotation.id,
              enquiryId: enquiry.id,
              summary: `${user.name} created quotation ${referenceNo} ${revisionLabel(0)} for Job ${enquiry.jobNo}`,
              metadata: { referenceNo, revision: 0, total },
            },
            tx,
          )
        } else {
          referenceNo = existing.referenceNo
          const latest = existing.versions[0]
          const base = parsed.versionId
            ? existing.versions.find((version) => version.id === parsed.versionId)
            : undefined

          if (parsed.mode === 'update-version') {
            if (!base) throw new NotFoundError('That version could not be found.')
            saved = await tx.quotationVersion.update({
              where: { id: base.id },
              data: { ...data, updatedById: user.id },
              select: { id: true, revision: true },
            })
            created = 'updated'
            isLatest = base.id === latest?.id

            await writeAudit(
              {
                actorId: user.id,
                companyId: company.id,
                action: 'QUOTATION_VERSION_UPDATED',
                entity: 'QUOTATION',
                entityId: existing.id,
                enquiryId: enquiry.id,
                summary: `${user.name} updated quotation ${referenceNo} ${revisionLabel(saved.revision)}`,
                metadata: { referenceNo, revision: saved.revision, total },
              },
              tx,
            )
          } else {
            const revision = (latest?.revision ?? -1) + 1
            saved = await tx.quotationVersion.create({
              data: {
                quotationId: existing.id,
                revision,
                ...data,
                createdById: user.id,
                updatedById: user.id,
              },
              select: { id: true, revision: true },
            })
            created = 'version'
            isLatest = true

            await writeAudit(
              {
                actorId: user.id,
                companyId: company.id,
                action: 'QUOTATION_VERSION_CREATED',
                entity: 'QUOTATION',
                entityId: existing.id,
                enquiryId: enquiry.id,
                summary: `${user.name} issued quotation ${referenceNo} ${revisionLabel(revision)}${
                  base ? ` from ${revisionLabel(base.revision)}` : ''
                }`,
                metadata: {
                  referenceNo,
                  revision,
                  basedOn: base?.revision ?? null,
                  total,
                },
              },
              tx,
            )
          }

          await tx.quotation.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })
        }

        // The pipeline follows the latest offer.
        const previousQuoteValue = enquiry.quoteValue === null ? null : Number(enquiry.quoteValue)
        let quoteValueUpdated = false
        if (isLatest && previousQuoteValue !== total) {
          await tx.enquiry.update({
            where: { id: enquiry.id },
            data: { quoteValue: total, updatedById: user.id },
          })
          quoteValueUpdated = true

          const change: FieldChange = {
            field: 'quoteValue',
            label: 'Quote Value',
            from: previousQuoteValue === null ? null : formatCurrency(previousQuoteValue, company.currency),
            to: formatCurrency(total, company.currency),
          }
          await writeAudit(
            {
              actorId: user.id,
              companyId: company.id,
              action: 'ENQUIRY_UPDATED',
              entity: 'ENQUIRY',
              entityId: enquiry.id,
              enquiryId: enquiry.id,
              summary: `Quote Value on Job ${enquiry.jobNo} set from quotation ${referenceNo} ${revisionLabel(saved.revision)}`,
              changes: [change],
              metadata: { source: 'quotation', referenceNo, revision: saved.revision },
            },
            tx,
          )
        }

        return {
          versionId: saved.id,
          revision: saved.revision,
          referenceNo,
          created,
          quoteValueUpdated,
          previousQuoteValue,
        }
      })
    } catch (error) {
      // Two people adding a version to the same quotation at the same moment
      // would both claim the same revision number; the unique index stops the
      // second, and they are asked to look again rather than overwrite.
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'Someone else saved this quotation at the same moment. Reload to see their version, then save again.',
        )
      }
      throw error
    }

    revalidatePath(`/c/${company.id}/pipeline`)
    revalidatePath(`/c/${company.id}/quotations/${enquiry.id}`)
    publishPipelineChange({
      companyId: company.id,
      actorId: user.id,
      action: 'quotation.saved',
      entityId: enquiry.id,
    })

    const { previousQuoteValue: _previous, ...payload } = result
    return payload
  })
}

const SETTINGS_FIELDS: { field: keyof QuotationSettingsValues & string; label: string }[] = [
  { field: 'letterheadName', label: 'Letterhead name' },
  { field: 'address', label: 'Address' },
  { field: 'contactNumber', label: 'Contact number' },
  { field: 'email', label: 'Email' },
  { field: 'footerText', label: 'Footer text' },
  { field: 'referencePrefix', label: 'Reference prefix' },
  { field: 'nextReferenceNo', label: 'Next reference number' },
  { field: 'defaultScope', label: 'Default scope of work' },
  { field: 'vatNote', label: 'VAT note' },
]

export async function updateQuotationSettingsAction(
  input: unknown,
): Promise<ActionResult<{ changeCount: number }>> {
  return runAction('updateQuotationSettings', async () => {
    const parsed = updateQuotationSettingsSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'quotation:settings')
    const values = parsed.data

    const changeCount = await prisma.$transaction(async (tx) => {
      const before = await getQuotationSettings(company.id, tx)
      const changes = diffRecords(
        before as unknown as Record<string, unknown>,
        values as unknown as Record<string, unknown>,
        SETTINGS_FIELDS,
      )
      if (JSON.stringify(before.defaultTerms) !== JSON.stringify(values.defaultTerms)) {
        changes.push({
          field: 'defaultTerms',
          label: 'Default terms',
          from: `${before.defaultTerms.length} terms`,
          to: `${values.defaultTerms.length} terms`,
        })
      }
      if (changes.length === 0) return 0

      const data = settingsCreateData(company.id, values)
      await tx.quotationSettings.upsert({
        where: { companyId: company.id },
        create: data,
        update: { ...data, companyId: undefined },
      })

      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'QUOTATION_SETTINGS_UPDATED',
          entity: 'COMPANY',
          entityId: company.id,
          summary: `${user.name} changed the quotation settings`,
          changes,
        },
        tx,
      )
      return changes.length
    })

    revalidatePath(`/c/${company.id}/admin/quotations`)
    return { changeCount }
  })
}
