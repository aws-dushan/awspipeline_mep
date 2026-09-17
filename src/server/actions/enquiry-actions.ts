'use server'

import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'

import { diffRecords, summarizeChanges, writeAudit, type FieldChange } from '@/lib/audit'
import {
  AuthorizationError,
  requireCompanyAccess,
  requireCompanyPermission,
} from '@/lib/auth/session'
import { enforceAutomationRules } from '@/lib/database/automation-repository'
import { resolveCustomer } from '@/lib/database/customer-repository'
import { assertDropdownSelections } from '@/lib/database/dropdown-repository'
import { getEnquiryById } from '@/lib/database/enquiry-repository'
import { prisma } from '@/lib/database/prisma'
import { formatCurrency, parseCalendarDate } from '@/lib/format'
import { canEditEnquiry } from '@/lib/permissions'
import { formatJobNo } from '@/lib/pipeline/job-number'
import { publish, publishPipelineChange } from '@/lib/realtime/event-bus'
import {
  createCustomerSchema,
  createEnquirySchema,
  deleteRequestSchema,
  updateCustomerSchema,
  updateEnquirySchema,
  type EnquiryFormValues,
} from '@/lib/validation/enquiry'
import {
  ConflictError,
  NotFoundError,
  runAction,
  type ActionResult,
} from '@/server/actions/action-result'

function pipelinePath(companyId: string) {
  return `/c/${companyId}/pipeline`
}

/**
 * Allocate the next S.No and Job No for a company.
 *
 * Done inside the caller's transaction with an atomic increment, so two people
 * pressing "Add Request" at the same instant can never receive the same
 * number. The counter only ever moves forward - a soft-deleted row does not
 * release its number back into the pool.
 */
async function allocateNumbers(tx: Prisma.TransactionClient, companyId: string) {
  const counter = await tx.companyCounter.update({
    where: { companyId },
    data: { nextSerialNo: { increment: 1 }, nextJobNo: { increment: 1 } },
    select: { nextSerialNo: true, nextJobNo: true, jobNoPrefix: true, jobNoSuffix: true },
  })
  // `update` returns the post-increment values, so the allocated numbers are
  // the ones just below.
  const serialNo = counter.nextSerialNo - 1
  const jobNumber = counter.nextJobNo - 1
  return {
    serialNo,
    jobNo: formatJobNo(counter.jobNoPrefix, jobNumber, counter.jobNoSuffix),
  }
}

function toPersistable(data: EnquiryFormValues, customer: { id: string; name: string }) {
  return {
    salesResponsibleId: data.salesResponsibleId,
    customerId: customer.id,
    customerName: customer.name,
    projectName: data.projectName,
    statusValueId: data.statusValueId,
    locationValueId: data.locationValueId,
    materialValueId: data.materialValueId,
    enquiryDetails: data.enquiryDetails,
    quoteValue: data.quoteValue,
    probabilityValueId: data.probabilityValueId,
    expectedOrderDate: parseCalendarDate(data.expectedOrderDate),
    expectedBillingDate: parseCalendarDate(data.expectedBillingDate),
    email: data.email,
    phoneNumber: data.phoneNumber,
    remarks: data.remarks,
  }
}

/** Confirm the sales owner is actually a member of this company. */
async function assertCompanyMember(companyId: string, userId: string | null) {
  if (!userId) return
  const membership = await prisma.userCompany.findFirst({
    where: { companyId, userId, user: { isActive: true } },
    select: { id: true },
  })
  if (!membership) {
    throw new AuthorizationError('The selected sales owner does not belong to this company.')
  }
}

export async function createEnquiryAction(
  input: unknown,
): Promise<ActionResult<{ id: string; jobNo: string; serialNo: number }>> {
  return runAction('createEnquiry', async () => {
    const parsed = createEnquirySchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'pipeline:create')
    const raw = parsed.data

    await Promise.all([
      assertDropdownSelections(company.id, {
        STATUS: raw.statusValueId,
        LOCATION: raw.locationValueId,
        MATERIAL: raw.materialValueId,
        PROBABILITY: raw.probabilityValueId,
      }),
      assertCompanyMember(company.id, raw.salesResponsibleId),
    ])

    // Re-apply the admin's Status/Probability linkage server-side. On a new
    // record every selection counts as changed.
    const enforced = await enforceAutomationRules({
      companyId: company.id,
      selection: {
        STATUS: raw.statusValueId,
        LOCATION: raw.locationValueId,
        MATERIAL: raw.materialValueId,
        PROBABILITY: raw.probabilityValueId,
      },
    })

    // Automation replaces a selection; it never clears one. These four are
    // required by the form, so falling back to what was submitted keeps that
    // guarantee rather than quietly writing a null.
    const data: EnquiryFormValues = {
      ...raw,
      statusValueId: enforced.STATUS ?? raw.statusValueId,
      locationValueId: enforced.LOCATION ?? raw.locationValueId,
      materialValueId: enforced.MATERIAL ?? raw.materialValueId,
      probabilityValueId: enforced.PROBABILITY ?? raw.probabilityValueId,
    }

    const created = await prisma.$transaction(async (tx) => {
      const customer = await resolveCustomer(tx, {
        companyId: company.id,
        customerId: data.customerId,
        customerName: data.customerName,
        actorId: user.id,
        email: data.email,
        phone: data.phoneNumber,
      })

      const { serialNo, jobNo } = await allocateNumbers(tx, company.id)

      const enquiry = await tx.enquiry.create({
        data: {
          companyId: company.id,
          serialNo,
          jobNo,
          // When the request came in, taken from the clock rather than from
          // the form. It is a record of an event, not a field to choose.
          enquiryDate: new Date(),
          ...toPersistable(data, customer),
          createdById: user.id,
          updatedById: user.id,
        },
        select: { id: true, jobNo: true, serialNo: true, customerName: true },
      })

      if (customer.created) {
        await writeAudit(
          {
            actorId: user.id,
            companyId: company.id,
            action: 'CUSTOMER_CREATED',
            entity: 'CUSTOMER',
            entityId: customer.id,
            summary: `${user.name} added customer ${customer.name}`,
            metadata: { source: 'enquiry-form', jobNo: enquiry.jobNo },
          },
          tx,
        )
      }

      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'ENQUIRY_CREATED',
          entity: 'ENQUIRY',
          entityId: enquiry.id,
          enquiryId: enquiry.id,
          summary: `${user.name} created Job ${enquiry.jobNo} for ${enquiry.customerName}`,
          metadata: { jobNo: enquiry.jobNo, serialNo: enquiry.serialNo },
        },
        tx,
      )

      return { ...enquiry, customerCreated: customer.created }
    })

    revalidatePath(pipelinePath(company.id))
    publishPipelineChange({
      companyId: company.id,
      actorId: user.id,
      action: 'enquiry.created',
      entityId: created.id,
    })
    if (created.customerCreated) {
      publish({
        channel: 'customers',
        companyId: company.id,
        actorId: user.id,
        action: 'customer.created',
      })
    }
    return { id: created.id, jobNo: created.jobNo, serialNo: created.serialNo }
  })
}

/** Create a customer on its own, from the customer picker or admin screen. */
export async function createCustomerAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction('createCustomer', async () => {
    const parsed = createCustomerSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'pipeline:create')

    const created = await prisma.$transaction(async (tx) => {
      const customer = await resolveCustomer(tx, {
        companyId: company.id,
        customerId: null,
        customerName: parsed.name,
        actorId: user.id,
        email: parsed.email,
        phone: parsed.phone,
      })

      if (!customer.created) {
        throw new ConflictError(`"${customer.name}" is already in the customer list.`)
      }

      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'CUSTOMER_CREATED',
          entity: 'CUSTOMER',
          entityId: customer.id,
          summary: `${user.name} added customer ${customer.name}`,
          metadata: { email: parsed.email, phone: parsed.phone },
        },
        tx,
      )

      return customer
    })

    publish({
      channel: 'customers',
      companyId: company.id,
      actorId: user.id,
      action: 'customer.created',
      entityId: created.id,
    })
    return { id: created.id, name: created.name }
  })
}

/**
 * Edit a customer.
 *
 * Renaming writes the new name across that customer's enquiries too: the
 * pipeline keeps a denormalised `customerName` so filtering, sorting and the
 * export stay single-table, and the two must not drift apart.
 */
export async function updateCustomerAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; renamedEnquiries: number }>> {
  return runAction('updateCustomer', async () => {
    const parsed = updateCustomerSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'pipeline:create')

    const existing = await prisma.customer.findFirst({
      where: { id: parsed.customerId, companyId: company.id },
      select: { id: true, name: true, email: true, phone: true, isActive: true },
    })
    if (!existing) throw new NotFoundError('That customer no longer exists.')

    const renamed = existing.name.trim().toLowerCase() !== parsed.name.trim().toLowerCase()

    if (renamed) {
      const clash = await prisma.customer.findFirst({
        where: {
          companyId: company.id,
          id: { not: existing.id },
          name: { equals: parsed.name, mode: 'insensitive' },
        },
        select: { id: true },
      })
      if (clash) {
        throw new ConflictError(`Another customer is already called "${parsed.name}".`)
      }
    }

    const changes = diffRecords(
      {
        name: existing.name,
        email: existing.email,
        phone: existing.phone,
        isActive: existing.isActive,
      },
      {
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        isActive: parsed.isActive,
      },
      [
        { field: 'name', label: 'Name' },
        { field: 'email', label: 'Email' },
        { field: 'phone', label: 'Phone' },
        { field: 'isActive', label: 'Active' },
      ],
    )

    const renamedEnquiries = await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          isActive: parsed.isActive,
        },
      })

      let touched = 0
      if (renamed) {
        const result = await tx.enquiry.updateMany({
          where: { companyId: company.id, customerId: existing.id },
          data: { customerName: parsed.name },
        })
        touched = result.count
      }

      if (changes.length > 0) {
        await writeAudit(
          {
            actorId: user.id,
            companyId: company.id,
            action: 'CUSTOMER_UPDATED',
            entity: 'CUSTOMER',
            entityId: existing.id,
            summary: renamed
              ? `${user.name} renamed customer "${existing.name}" to "${parsed.name}"`
              : `${user.name} updated customer ${parsed.name}`,
            changes,
            metadata: renamed ? { renamedEnquiries: touched } : undefined,
          },
          tx,
        )
      }

      return touched
    })

    revalidatePath(`/c/${company.id}/customers`)
    publish({
      channel: 'customers',
      companyId: company.id,
      actorId: user.id,
      action: 'customer.updated',
      entityId: existing.id,
    })
    // A rename changes what the grid shows, so the pipeline needs to refresh.
    if (renamed) {
      revalidatePath(pipelinePath(company.id))
      publishPipelineChange({
        companyId: company.id,
        actorId: user.id,
        action: 'customer.renamed',
      })
    }

    return { id: existing.id, name: parsed.name, renamedEnquiries }
  })
}

/** Customer list for the picker. Company access is checked before reading. */
export async function listCustomersAction(companyId: string, search?: string) {
  return runAction('listCustomers', async () => {
    const { company } = await requireCompanyAccess(companyId)
    const { listCustomers } = await import('@/lib/database/customer-repository')
    return listCustomers(company.id, { search })
  })
}

/** Fields tracked in the audit diff, with the labels shown in the history. */
const AUDITED_FIELDS = [
  { field: 'salesResponsible', label: 'Sales Responsible' },
  { field: 'customerName', label: 'Customer Name' },
  { field: 'projectName', label: 'Project Name' },
  { field: 'status', label: 'Status' },
  { field: 'location', label: 'Location' },
  { field: 'material', label: 'Material' },
  { field: 'enquiryDetails', label: 'Enquiry Details' },
  { field: 'quoteValue', label: 'Quote Value' },
  { field: 'probability', label: 'Probability' },
  { field: 'expectedOrderDate', label: 'Exp Order Date' },
  { field: 'expectedBillingDate', label: 'Exp Billing Date' },
  { field: 'email', label: 'Email' },
  { field: 'phoneNumber', label: 'Phone Number' },
  { field: 'remarks', label: 'Remarks' },
] as const

/**
 * Resolve an enquiry into the human-readable shape the audit diff compares.
 * Ids become labels, so history reads "Status: Pending -> Quoted" rather than
 * a pair of cuids.
 */
async function toAuditShape(
  companyId: string,
  currency: string,
  values: {
    salesResponsibleId: string | null
    customerName: string
    projectName: string | null
    statusValueId: string | null
    locationValueId: string | null
    materialValueId: string | null
    enquiryDetails: string | null
    quoteValue: number | null
    probabilityValueId: string | null
    expectedOrderDate: Date | null
    expectedBillingDate: Date | null
    email: string | null
    phoneNumber: string | null
    remarks: string | null
  },
): Promise<Record<string, unknown>> {
  const valueIds = [
    values.statusValueId,
    values.locationValueId,
    values.materialValueId,
    values.probabilityValueId,
  ].filter((id): id is string => Boolean(id))

  const [dropdowns, salesUser] = await Promise.all([
    valueIds.length > 0
      ? prisma.dropdownValue.findMany({
          where: { id: { in: valueIds }, companyId },
          select: { id: true, label: true },
        })
      : Promise.resolve([]),
    values.salesResponsibleId
      ? prisma.user.findUnique({
          where: { id: values.salesResponsibleId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ])

  const labelById = new Map(dropdowns.map((value) => [value.id, value.label]))
  const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)

  return {
    salesResponsible: salesUser?.name ?? null,
    customerName: values.customerName,
    projectName: values.projectName,
    status: values.statusValueId ? labelById.get(values.statusValueId) ?? null : null,
    location: values.locationValueId ? labelById.get(values.locationValueId) ?? null : null,
    material: values.materialValueId ? labelById.get(values.materialValueId) ?? null : null,
    enquiryDetails: values.enquiryDetails,
    quoteValue:
      values.quoteValue === null ? null : formatCurrency(values.quoteValue, currency),
    probability: values.probabilityValueId
      ? labelById.get(values.probabilityValueId) ?? null
      : null,
    expectedOrderDate: isoDay(values.expectedOrderDate),
    expectedBillingDate: isoDay(values.expectedBillingDate),
    email: values.email,
    phoneNumber: values.phoneNumber,
    remarks: values.remarks,
  }
}

export async function updateEnquiryAction(
  input: unknown,
): Promise<ActionResult<{ id: string; changeCount: number }>> {
  return runAction('updateEnquiry', async () => {
    const parsed = updateEnquirySchema.parse(input)
    const { user, company } = await requireCompanyAccess(parsed.companyId)
    const raw = parsed.data

    const existing = await prisma.enquiry.findFirst({
      where: { id: parsed.enquiryId, companyId: company.id, isDeleted: false },
      select: {
        id: true,
        jobNo: true,
        createdById: true,
        salesResponsibleId: true,
        enquiryDate: true,
        customerName: true,
        projectName: true,
        statusValueId: true,
        locationValueId: true,
        materialValueId: true,
        enquiryDetails: true,
        quoteValue: true,
        probabilityValueId: true,
        expectedOrderDate: true,
        expectedBillingDate: true,
        email: true,
        phoneNumber: true,
        remarks: true,
      },
    })
    if (!existing) throw new NotFoundError('This request no longer exists.')

    if (!canEditEnquiry(user, existing)) {
      throw new AuthorizationError('You can only edit requests you created or own.')
    }

    await Promise.all([
      assertDropdownSelections(company.id, {
        STATUS: raw.statusValueId,
        LOCATION: raw.locationValueId,
        MATERIAL: raw.materialValueId,
        PROBABILITY: raw.probabilityValueId,
      }),
      assertCompanyMember(company.id, raw.salesResponsibleId),
    ])

    const enforced = await enforceAutomationRules({
      companyId: company.id,
      selection: {
        STATUS: raw.statusValueId,
        LOCATION: raw.locationValueId,
        MATERIAL: raw.materialValueId,
        PROBABILITY: raw.probabilityValueId,
      },
      previous: {
        STATUS: existing.statusValueId,
        LOCATION: existing.locationValueId,
        MATERIAL: existing.materialValueId,
        PROBABILITY: existing.probabilityValueId,
      },
    })

    // Automation replaces a selection; it never clears one. These four are
    // required by the form, so falling back to what was submitted keeps that
    // guarantee rather than quietly writing a null.
    const data: EnquiryFormValues = {
      ...raw,
      statusValueId: enforced.STATUS ?? raw.statusValueId,
      locationValueId: enforced.LOCATION ?? raw.locationValueId,
      materialValueId: enforced.MATERIAL ?? raw.materialValueId,
      probabilityValueId: enforced.PROBABILITY ?? raw.probabilityValueId,
    }

    const resolvedCustomer = await prisma.$transaction((tx) =>
      resolveCustomer(tx, {
        companyId: company.id,
        customerId: data.customerId,
        customerName: data.customerName,
        actorId: user.id,
        email: data.email,
        phone: data.phoneNumber,
      }),
    )

    const persistable = toPersistable(data, resolvedCustomer)

    const [before, after] = await Promise.all([
      toAuditShape(company.id, company.currency, {
        ...existing,
        quoteValue: existing.quoteValue === null ? null : Number(existing.quoteValue),
      }),
      toAuditShape(company.id, company.currency, persistable),
    ])

    const changes: FieldChange[] = diffRecords(before, after, [...AUDITED_FIELDS])

    await prisma.$transaction(async (tx) => {
      await tx.enquiry.update({
        where: { id: existing.id },
        data: { ...persistable, updatedById: user.id },
      })

      if (changes.length > 0) {
        await writeAudit(
          {
            actorId: user.id,
            companyId: company.id,
            action: 'ENQUIRY_UPDATED',
            entity: 'ENQUIRY',
            entityId: existing.id,
            enquiryId: existing.id,
            summary: summarizeChanges(user.name, `Job ${existing.jobNo}`, changes),
            changes,
          },
          tx,
        )
      }
    })

    revalidatePath(pipelinePath(company.id))
    publishPipelineChange({
      companyId: company.id,
      actorId: user.id,
      action: 'enquiry.updated',
      entityId: existing.id,
    })
    return { id: existing.id, changeCount: changes.length }
  })
}

/**
 * Submit a deletion request. The enquiry itself is untouched - users never
 * delete rows directly, an approval always stands between the two.
 */
export async function requestEnquiryDeletionAction(
  input: unknown,
): Promise<ActionResult<{ requestId: string; supervisorName: string | null }>> {
  return runAction('requestEnquiryDeletion', async () => {
    const parsed = deleteRequestSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'delete:request')

    const enquiry = await prisma.enquiry.findFirst({
      where: { id: parsed.enquiryId, companyId: company.id, isDeleted: false },
      select: { id: true, jobNo: true, customerName: true, projectName: true },
    })
    if (!enquiry) throw new NotFoundError('This request no longer exists.')

    const existingRequest = await prisma.deleteRequest.findFirst({
      where: { enquiryId: enquiry.id, status: 'PENDING' },
      select: { id: true },
    })
    if (existingRequest) {
      throw new ConflictError('A deletion request is already awaiting approval for this record.')
    }

    // Route to the requester's supervisor. Admins and supervisors without one
    // of their own fall through to the unassigned queue, which any admin sees.
    const assignment = await prisma.supervisorAssignment.findUnique({
      where: { userId: user.id },
      select: { supervisor: { select: { id: true, name: true, isActive: true } } },
    })
    const supervisor = assignment?.supervisor?.isActive ? assignment.supervisor : null

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.deleteRequest.create({
        data: {
          companyId: company.id,
          enquiryId: enquiry.id,
          requestedById: user.id,
          reason: parsed.reason,
          supervisorId: supervisor?.id ?? null,
          status: 'PENDING',
        },
        select: { id: true },
      })

      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'ENQUIRY_DELETE_REQUESTED',
          entity: 'DELETE_REQUEST',
          entityId: created.id,
          enquiryId: enquiry.id,
          summary: `${user.name} requested deletion of Job ${enquiry.jobNo}`,
          metadata: {
            reason: parsed.reason,
            jobNo: enquiry.jobNo,
            customerName: enquiry.customerName,
            routedTo: supervisor?.name ?? 'Unassigned (admin queue)',
          },
        },
        tx,
      )

      return created
    })

    revalidatePath(pipelinePath(company.id))
    revalidatePath(`/c/${company.id}/delete-requests`)
    publishPipelineChange({
      companyId: company.id,
      actorId: user.id,
      action: 'enquiry.delete-requested',
      entityId: enquiry.id,
    })
    publish({
      channel: 'delete-requests',
      companyId: company.id,
      actorId: user.id,
      action: 'delete-request.created',
      entityId: request.id,
    })
    return { requestId: request.id, supervisorName: supervisor?.name ?? null }
  })
}

export async function cancelDeleteRequestAction(
  input: unknown,
): Promise<ActionResult<{ requestId: string }>> {
  return runAction('cancelDeleteRequest', async () => {
    const { companyId, requestId } = input as { companyId: string; requestId: string }
    const { user, company } = await requireCompanyAccess(companyId)

    const request = await prisma.deleteRequest.findFirst({
      where: { id: requestId, companyId: company.id, status: 'PENDING' },
      select: { id: true, requestedById: true, enquiry: { select: { id: true, jobNo: true } } },
    })
    if (!request) throw new NotFoundError('This request is no longer pending.')
    if (request.requestedById !== user.id && user.role !== 'ADMIN') {
      throw new AuthorizationError('You can only withdraw your own deletion requests.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.deleteRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          decidedById: user.id,
          decidedAt: new Date(),
          decisionNote: 'Withdrawn by the requester.',
        },
      })
      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'ENQUIRY_DELETE_REJECTED',
          entity: 'DELETE_REQUEST',
          entityId: request.id,
          enquiryId: request.enquiry.id,
          summary: `${user.name} withdrew the deletion request for Job ${request.enquiry.jobNo}`,
        },
        tx,
      )
    })

    revalidatePath(pipelinePath(company.id))
    revalidatePath(`/c/${company.id}/delete-requests`)
    return { requestId: request.id }
  })
}

export async function getEnquiryDetailAction(companyId: string, enquiryId: string) {
  return runAction('getEnquiryDetail', async () => {
    const { company } = await requireCompanyAccess(companyId)
    const enquiry = await getEnquiryById(company.id, enquiryId)
    if (!enquiry) throw new NotFoundError()
    return enquiry
  })
}
