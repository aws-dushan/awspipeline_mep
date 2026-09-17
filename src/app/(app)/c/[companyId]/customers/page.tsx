import type { Metadata } from 'next'

import { CustomerDirectory } from '@/components/customers/customer-directory'
import { requireCompanyPage } from '@/lib/auth/session'
import { listCustomers } from '@/lib/database/customer-repository'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Customers' }

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const { user, company } = await requireCompanyPage(companyId)

  const customers = await listCustomers(company.id, { includeInactive: true })

  return (
    <CustomerDirectory
      companyId={company.id}
      currentUserId={user.id}
      customers={customers}
      canCreate={can(user, 'pipeline:create')}
    />
  )
}

export const dynamic = 'force-dynamic'
