'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

import { diffRecords, writeAudit, type FieldChange } from '@/lib/audit'
import {
  AuthorizationError,
  requireCompanyAccess,
  requireCompanyPermission,
} from '@/lib/auth/session'
import { enforceAutomationRules } from '@/lib/database/automation-repository'
import { prisma } from '@/lib/database/prisma'
import {
  getQuotationSettings,
  getReferenceLocation,
  settingsCreateData,
} from '@/lib/database/quotation-repository'
import { formatCurrency, parseCalendarDate } from '@/lib/format'
import { canEditEnquiry } from '@/lib/permissions'
import {
  buildReference,
  quotationPayable,
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
  /** The Status the request moved to, when saving changed it. */
  statusChangedTo: string | null
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
    discountedPrice: values.discountedPrice,
  }
}

/**
 * The reference a request's quotation is issued under: AWS/<location>/<Job No>.
 *
 * Fixed when the quotation is created. A reference is what the customer quotes
 * back, so a later change to the request's location does not rename it.
 */
async function referenceFor(
  tx: Prisma.TransactionClient,
  enquiry: { id: string; jobNo: string },
): Promise<string> {
  return buildReference(await getReferenceLocation(enquiry.id, tx), enquiry.jobNo)
}

type SelectionChange = { from: string | null; to: { id: string; label: string } } | null

/**
 * What issuing a quotation does to the request's Status, and through the
 * automation rules to its Probability.
 *
 * Status becomes the company's "Quoted" value - unless the request is already
 * Won: revising the quotation for a won job must not reopen it. Dropdown values
 * are company data, so a company that has renamed or removed "Quoted" simply
 * keeps its Status - a missing label must never stop a quotation being saved.
 */
async function quotedSelection(
  companyId: string,
  enquiry: { statusValueId: string | null; probabilityValueId: string | null },
): Promise<{ status: SelectionChange; probability: SelectionChange }> {
  const unchanged = { status: null, probability: null }
  const [quoted, current] = await Promise.all([
    prisma.dropdownValue.findFirst({
      where: { companyId, typeKey: 'STATUS', isActive: true, label: { equals: 'Quoted', mode: 'insensitive' } },
      select: { id: true },
    }),
    enquiry.statusValueId
      ? prisma.dropdownValue.findUnique({ where: { id: enquiry.statusValueId }, select: { label: true } })
      : null,
  ])
  if (!quoted || quoted.id === enquiry.statusValueId) return unchanged
  if (current?.label.trim().toLowerCase() === 'won') return unchanged

  const enforced = await enforceAutomationRules({
    companyId,
    selection: { STATUS: quoted.id, PROBABILITY: enquiry.probabilityValueId },
    previous: { STATUS: enquiry.statusValueId, PROBABILITY: enquiry.probabilityValueId },
  })
  const statusId = enforced.STATUS ?? quoted.id
  const probabilityId = enforced.PROBABILITY ?? enquiry.probabilityValueId

  const ids = [enquiry.statusValueId, statusId, enquiry.probabilityValueId, probabilityId].filter(
    (id): id is string => Boolean(id),
  )
  const labels = new Map(
    (
      await prisma.dropdownValue.findMany({
        where: { companyId, id: { in: ids } },
        select: { id: true, label: true },
      })
    ).map((value) => [value.id, value.label]),
  )
  const change = (from: string | null, to: string | null): SelectionChange =>
    to && to !== from ? { from: from ? labels.get(from) ?? null : null, to: { id: to, label: labels.get(to) ?? '' } } : null

  return {
    status: change(enquiry.statusValueId, statusId),
    probability: change(enquiry.probabilityValueId, probabilityId),
  }
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
 * set to its total and its Status to Quoted, so the pipeline always shows the
 * current offer.
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
        statusValueId: true,
        probabilityValueId: true,
      },
    })
    if (!enquiry) throw new NotFoundError('That request could not be found.')
    if (!canEditEnquiry(user, enquiry)) {
      throw new AuthorizationError('You can view this quotation but not change it.')
    }

    // The sales block arrives filled in from the request's sales owner and may
    // have been adjusted on the sheet; what was saved is what prints.
    const values = parsed.data
    const pipeline = await quotedSelection(company.id, enquiry)
    const data = versionData(values, company.currency)
    // What the request is quoted at: the discounted price when one is given.
    const total = quotationPayable(values)

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
          referenceNo = await referenceFor(tx, enquiry)
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

        // The pipeline follows the latest offer: its total becomes the Quote
        // Value and the request is marked Quoted, with the company's
        // automation rules applied to that as they would be to an edit.
        const previousQuoteValue = enquiry.quoteValue === null ? null : Number(enquiry.quoteValue)
        let quoteValueUpdated = false
        if (isLatest) {
          const changes: FieldChange[] = []
          const update: Prisma.EnquiryUpdateInput = {}

          if (previousQuoteValue !== total) {
            update.quoteValue = total
            quoteValueUpdated = true
            changes.push({
              field: 'quoteValue',
              label: 'Quote Value',
              from: previousQuoteValue === null ? null : formatCurrency(previousQuoteValue, company.currency),
              to: formatCurrency(total, company.currency),
            })
          }
          if (pipeline.status) {
            update.status = { connect: { id: pipeline.status.to.id } }
            changes.push({ field: 'statusValueId', label: 'Status', from: pipeline.status.from, to: pipeline.status.to.label })
          }
          if (pipeline.probability) {
            update.probability = { connect: { id: pipeline.probability.to.id } }
            changes.push({
              field: 'probabilityValueId',
              label: 'Probability',
              from: pipeline.probability.from,
              to: pipeline.probability.to.label,
            })
          }

          if (changes.length > 0) {
            await tx.enquiry.update({
              where: { id: enquiry.id },
              data: { ...update, updatedBy: { connect: { id: user.id } } },
            })
            await writeAudit(
              {
                actorId: user.id,
                companyId: company.id,
                action: 'ENQUIRY_UPDATED',
                entity: 'ENQUIRY',
                entityId: enquiry.id,
                enquiryId: enquiry.id,
                summary: `Job ${enquiry.jobNo} updated from quotation ${referenceNo} ${revisionLabel(saved.revision)}`,
                changes,
                metadata: { source: 'quotation', referenceNo, revision: saved.revision },
              },
              tx,
            )
          }
        }

        return {
          versionId: saved.id,
          revision: saved.revision,
          referenceNo,
          created,
          quoteValueUpdated,
          statusChangedTo: isLatest ? pipeline.status?.to.label ?? null : null,
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
  { field: 'footerText', label: 'Footer text' },
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
