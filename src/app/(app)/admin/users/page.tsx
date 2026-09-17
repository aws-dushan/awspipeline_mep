import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { UserManager } from '@/components/admin/user-manager'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/database/prisma'
import { can } from '@/lib/permissions'
import { listUsersForAdmin } from '@/server/actions/admin-actions'

export const metadata: Metadata = { title: 'Users' }

export default async function AdminUsersPage() {
  const user = await requireUser()
  if (!can(user, 'user:manage')) redirect('/select-company')

  const [users, companies] = await Promise.all([
    listUsersForAdmin(),
    prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
  ])

  return <UserManager users={users} companies={companies} currentUserId={user.id} />
}

export const dynamic = 'force-dynamic'
