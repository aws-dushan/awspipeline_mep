import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CompanyManager, type AdminCompany } from '@/components/admin/company-manager'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/database/prisma'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Companies' }

export default async function AdminCompaniesPage() {
  const user = await requireUser()
  if (!can(user, 'company:manage')) redirect('/select-company')

  const rows = await prisma.company.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      color: true,
      currency: true,
      isActive: true,
      counter: { select: { nextJobNo: true, jobNoPrefix: true } },
      _count: { select: { userCompanies: true, enquiries: true } },
    },
  })

  const companies: AdminCompany[] = rows.map((company) => ({
    id: company.id,
    name: company.name,
    color: company.color,
    currency: company.currency,
    isActive: company.isActive,
    jobNoPrefix: company.counter?.jobNoPrefix ?? '',
    nextJobNo: company.counter?.nextJobNo ?? 1000,
    userCount: company._count.userCompanies,
    enquiryCount: company._count.enquiries,
  }))

  return <CompanyManager companies={companies} />
}

export const dynamic = 'force-dynamic'
