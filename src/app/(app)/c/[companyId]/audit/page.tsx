import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuditAction } from '@prisma/client'

import { AuditTimeline } from '@/components/audit/audit-timeline'
import { requireCompanyPage } from '@/lib/auth/session'
import { getAuditFeed } from '@/lib/audit'
import { prisma } from '@/lib/database/prisma'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Audit history' }

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ action?: string; actor?: string }>
}) {
  const { companyId } = await params
  const { user, company } = await requireCompanyPage(companyId)
  if (!can(user, 'audit:view')) redirect(`/c/${company.id}/pipeline`)

  const query = await searchParams
  const action =
    query.action && query.action in AuditAction ? (query.action as AuditAction) : undefined
  const actorId = query.actor && query.actor !== 'ALL' ? query.actor : undefined

  const [feed, actors] = await Promise.all([
    getAuditFeed({ companyId: company.id, action, actorId, take: 120 }),
    prisma.user.findMany({
      where: { auditLogs: { some: { companyId: company.id } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, avatarColor: true },
    }),
  ])

  return (
    <AuditTimeline
      companyId={company.id}
      currentUserId={user.id}
      entries={feed.entries.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      }))}
      actors={actors}
      selectedAction={action ?? 'ALL'}
      selectedActor={actorId ?? 'ALL'}
    />
  )
}

export const dynamic = 'force-dynamic'
