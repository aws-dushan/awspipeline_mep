import type { Metadata } from 'next'

import { PipelineView } from '@/components/pipeline/pipeline-view'
import { requireCompanyPage } from '@/lib/auth/session'
import { getAutomationRules } from '@/lib/database/automation-repository'
import { listCustomers } from '@/lib/database/customer-repository'
import { getCompanyMembers, getDropdownCatalogue } from '@/lib/database/dropdown-repository'
import { queryPipelinePage } from '@/lib/database/enquiry-repository'
import { parseEnquiryFilters } from '@/lib/filters/enquiry-filters'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Pipeline' }

/**
 * Pipeline screen.
 *
 * The first page is rendered on the server so the grid is populated on first
 * paint; the client then takes over with TanStack Query plus the live SSE
 * channel, which keeps it current without the user refreshing.
 */
export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { companyId } = await params
  const { user, company } = await requireCompanyPage(companyId)

  const filters = parseEnquiryFilters(await searchParams)

  const [page, catalogue, members, customers, automationRules] = await Promise.all([
    queryPipelinePage({ companyId: company.id, filters }),
    getDropdownCatalogue(company.id, { includeInactive: true }),
    getCompanyMembers(company.id),
    listCustomers(company.id),
    getAutomationRules(company.id),
  ])

  return (
    <PipelineView
      company={{ id: company.id, name: company.name, currency: company.currency }}
      viewer={{
        id: user.id,
        name: user.name,
        role: user.role,
        supervisorName: user.supervisorName,
        canCreate: can(user, 'pipeline:create'),
        canExport: can(user, 'pipeline:export'),
        canRequestDelete: can(user, 'delete:request'),
      }}
      catalogue={catalogue}
      members={members}
      customers={customers}
      automationRules={automationRules}
      initialFilters={filters}
      initialPage={page}
    />
  )
}

export const dynamic = 'force-dynamic'
