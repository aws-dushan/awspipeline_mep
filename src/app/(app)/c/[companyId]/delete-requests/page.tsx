import type { Metadata } from 'next'
import type { DeleteRequestStatus } from '@prisma/client'

import { DeleteRequestBoard } from '@/components/delete-requests/delete-request-board'
import { requireCompanyPage } from '@/lib/auth/session'
import { can } from '@/lib/permissions'
import { listDeleteRequests } from '@/server/actions/delete-request-actions'

export const metadata: Metadata = { title: 'Delete requests' }

const STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'ALL'])

export default async function DeleteRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { companyId } = await params
  const { user, company } = await requireCompanyPage(companyId)
  const { status: rawStatus } = await searchParams

  const status = (
    rawStatus && STATUSES.has(rawStatus) ? rawStatus : 'PENDING'
  ) as DeleteRequestStatus | 'ALL'

  const requests = await listDeleteRequests(company.id, status)

  return (
    <DeleteRequestBoard
      companyId={company.id}
      currency={company.currency}
      currentUserId={user.id}
      requests={requests}
      initialStatus={status}
      canReview={can(user, 'delete:review')}
    />
  )
}

export const dynamic = 'force-dynamic'
