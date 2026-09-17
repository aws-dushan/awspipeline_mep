'use server'

import { revalidatePath } from 'next/cache'
import type { DeleteRequestStatus, Prisma } from '@prisma/client'

import { writeAudit } from '@/lib/audit'
import {
  AuthorizationError,
  getSubordinateIds,
  requireCompanyAccess,
  requireCompanyPermission,
  type CurrentUser,
} from '@/lib/auth/session'
import { prisma } from '@/lib/database/prisma'
import { can } from '@/lib/permissions'
import { publish, publishPipelineChange } from '@/lib/realtime/event-bus'
import { deleteDecisionSchema } from '@/lib/validation/enquiry'
import { NotFoundError, runAction, type ActionResult } from '@/server/actions/action-result'

/**
 * Which deletion requests may this user act on?
 *
 * - Admins see every request in the company.
 * - Supervisors see requests from their direct reports, requests explicitly
 *   routed to them, and the unassigned queue.
 * - Everyone else sees only their own submissions (read-only).
 */
export async function buildReviewScope(
  user: CurrentUser,
  companyId: string,
): Promise<Prisma.DeleteRequestWhereInput> {
  if (can(user, 'delete:review:any')) {
    return { companyId }
  }

  if (can(user, 'delete:review')) {
    const subordinateIds = await getSubordinateIds(user.id)
    return {
      companyId,
      OR: [
        { supervisorId: user.id },
        ...(subordinateIds.length > 0 ? [{ requestedById: { in: subordinateIds } }] : []),
        { requestedById: user.id },
      ],
    }
  }

  return { companyId, requestedById: user.id }
}

export type DeleteRequestListItem = {
  id: string
  status: DeleteRequestStatus
  reason: string
  requestedAt: string
  decidedAt: string | null
  decisionNote: string | null
  canDecide: boolean
  requestedBy: { id: string; name: string; avatarColor: string; displayCode: string | null }
  supervisor: { id: string; name: string } | null
  decidedBy: { id: string; name: string } | null
  enquiry: {
    id: string
    jobNo: string
    serialNo: number
    customerName: string
    projectName: string | null
    enquiryDate: string | null
    quoteValue: number | null
    status: { label: string; color: string | null } | null
    isDeleted: boolean
  }
}

export async function listDeleteRequests(
  companyId: string,
  status: DeleteRequestStatus | 'ALL' = 'PENDING',
): Promise<DeleteRequestListItem[]> {
  const { user } = await requireCompanyAccess(companyId)
  const scope = await buildReviewScope(user, companyId)

  const rows = await prisma.deleteRequest.findMany({
    where: {
      ...scope,
      ...(status === 'ALL' ? {} : { status }),
    },
    orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      status: true,
      reason: true,
      requestedAt: true,
      decidedAt: true,
      decisionNote: true,
      supervisorId: true,
      requestedById: true,
      requestedBy: { select: { id: true, name: true, avatarColor: true, displayCode: true } },
      supervisor: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      enquiry: {
        select: {
          id: true,
          jobNo: true,
          serialNo: true,
          customerName: true,
          projectName: true,
          enquiryDate: true,
          quoteValue: true,
          isDeleted: true,
          status: { select: { label: true, color: true } },
        },
      },
    },
  })

  const subordinateIds = can(user, 'delete:review') ? await getSubordinateIds(user.id) : []

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    reason: row.reason,
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    canDecide:
      row.status === 'PENDING' &&
      row.requestedById !== user.id &&
      (can(user, 'delete:review:any') ||
        (can(user, 'delete:review') &&
          (row.supervisorId === user.id || subordinateIds.includes(row.requestedById)))),
    requestedBy: row.requestedBy,
    supervisor: row.supervisor,
    decidedBy: row.decidedBy,
    enquiry: {
      ...row.enquiry,
      enquiryDate: row.enquiry.enquiryDate?.toISOString() ?? null,
      quoteValue: row.enquiry.quoteValue === null ? null : Number(row.enquiry.quoteValue),
    },
  }))
}

export async function countPendingDeleteRequests(companyId: string): Promise<number> {
  const { user } = await requireCompanyAccess(companyId)
  if (!can(user, 'delete:review')) return 0
  const scope = await buildReviewScope(user, companyId)
  return prisma.deleteRequest.count({
    where: { ...scope, status: 'PENDING', requestedById: { not: user.id } },
  })
}

/**
 * Approve or reject a deletion request.
 *
 * Approval performs a SOFT delete only: the row is flagged and disappears from
 * the pipeline, its searches and its exports, but the record itself stays in
 * PostgreSQL permanently for audit purposes.
 */
export async function decideDeleteRequestAction(
  input: unknown,
): Promise<ActionResult<{ requestId: string; decision: DeleteRequestStatus; jobNo: string }>> {
  return runAction('decideDeleteRequest', async () => {
    const parsed = deleteDecisionSchema.parse(input)
    const { user, company } = await requireCompanyPermission(parsed.companyId, 'delete:review')

    const request = await prisma.deleteRequest.findFirst({
      where: { id: parsed.requestId, companyId: company.id },
      select: {
        id: true,
        status: true,
        reason: true,
        supervisorId: true,
        requestedById: true,
        requestedBy: { select: { id: true, name: true } },
        enquiry: { select: { id: true, jobNo: true, customerName: true, isDeleted: true } },
      },
    })
    if (!request) throw new NotFoundError('This deletion request no longer exists.')
    if (request.status !== 'PENDING') {
      throw new NotFoundError('This deletion request has already been decided.')
    }

    // Nobody signs off their own deletion, not even an admin.
    if (request.requestedById === user.id) {
      throw new AuthorizationError('You cannot approve your own deletion request.')
    }

    if (!can(user, 'delete:review:any')) {
      const subordinateIds = await getSubordinateIds(user.id)
      const isRoutedToMe = request.supervisorId === user.id
      const isMyReport = subordinateIds.includes(request.requestedById)
      if (!isRoutedToMe && !isMyReport) {
        throw new AuthorizationError('This request is not assigned to you for review.')
      }
    }

    const approved = parsed.decision === 'APPROVED'
    const now = new Date()

    await prisma.$transaction(async (tx) => {
      await tx.deleteRequest.update({
        where: { id: request.id },
        data: {
          status: parsed.decision,
          decidedById: user.id,
          decidedAt: now,
          decisionNote: parsed.note,
        },
      })

      if (approved) {
        await tx.enquiry.update({
          where: { id: request.enquiry.id },
          data: {
            isDeleted: true,
            deletedAt: now,
            deletedById: user.id,
            deleteReason: request.reason,
          },
        })
      }

      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: approved ? 'ENQUIRY_DELETE_APPROVED' : 'ENQUIRY_DELETE_REJECTED',
          entity: 'DELETE_REQUEST',
          entityId: request.id,
          enquiryId: request.enquiry.id,
          summary: approved
            ? `${user.name} approved deletion of Job ${request.enquiry.jobNo}`
            : `${user.name} rejected the deletion of Job ${request.enquiry.jobNo}`,
          metadata: {
            jobNo: request.enquiry.jobNo,
            customerName: request.enquiry.customerName,
            requestedBy: request.requestedBy.name,
            reason: request.reason,
            decisionNote: parsed.note,
          },
        },
        tx,
      )
    })

    revalidatePath(`/c/${company.id}/pipeline`)
    revalidatePath(`/c/${company.id}/delete-requests`)
    publishPipelineChange({
      companyId: company.id,
      actorId: user.id,
      action: approved ? 'enquiry.deleted' : 'enquiry.delete-rejected',
      entityId: request.enquiry.id,
    })
    publish({
      channel: 'delete-requests',
      companyId: company.id,
      actorId: user.id,
      action: 'delete-request.decided',
      entityId: request.id,
    })
    return { requestId: request.id, decision: parsed.decision, jobNo: request.enquiry.jobNo }
  })
}

/** Admin-only: bring a soft-deleted enquiry back into the live pipeline. */
export async function restoreEnquiryAction(
  input: unknown,
): Promise<ActionResult<{ enquiryId: string; jobNo: string }>> {
  return runAction('restoreEnquiry', async () => {
    const { companyId, enquiryId } = input as { companyId: string; enquiryId: string }
    const { user, company } = await requireCompanyPermission(companyId, 'delete:restore')

    const enquiry = await prisma.enquiry.findFirst({
      where: { id: enquiryId, companyId: company.id, isDeleted: true },
      select: { id: true, jobNo: true, customerName: true },
    })
    if (!enquiry) throw new NotFoundError('No deleted record found with that reference.')

    await prisma.$transaction(async (tx) => {
      await tx.enquiry.update({
        where: { id: enquiry.id },
        data: { isDeleted: false, deletedAt: null, deletedById: null, deleteReason: null },
      })
      await writeAudit(
        {
          actorId: user.id,
          companyId: company.id,
          action: 'ENQUIRY_RESTORED',
          entity: 'ENQUIRY',
          entityId: enquiry.id,
          enquiryId: enquiry.id,
          summary: `${user.name} restored Job ${enquiry.jobNo} to the pipeline`,
          metadata: { jobNo: enquiry.jobNo, customerName: enquiry.customerName },
        },
        tx,
      )
    })

    revalidatePath(`/c/${company.id}/pipeline`)
    publishPipelineChange({
      companyId: company.id,
      actorId: user.id,
      action: 'enquiry.restored',
      entityId: enquiry.id,
    })
    return { enquiryId: enquiry.id, jobNo: enquiry.jobNo }
  })
}
