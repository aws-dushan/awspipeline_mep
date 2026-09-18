import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { DropdownManager } from '@/components/admin/dropdown-manager'
import { requireCompanyPage } from '@/lib/auth/session'
import { getAutomationRules } from '@/lib/database/automation-repository'
import {
  getDropdownCatalogue,
  getDropdownUsageCounts,
} from '@/lib/database/dropdown-repository'
import { getRequiredFields } from '@/lib/database/field-rule-repository'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Dropdown settings' }

export default async function DropdownSettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const { user, company } = await requireCompanyPage(companyId)
  if (!can(user, 'dropdown:manage')) redirect(`/c/${company.id}/pipeline`)

  const [catalogue, usage, automationRules, requiredFields] = await Promise.all([
    getDropdownCatalogue(company.id, { includeInactive: true }),
    getDropdownUsageCounts(company.id),
    getAutomationRules(company.id, { includeInactive: true }),
    getRequiredFields(company.id),
  ])

  return (
    <DropdownManager
      companyId={company.id}
      companyName={company.name}
      catalogue={catalogue}
      usage={Object.fromEntries(usage)}
      automationRules={automationRules}
      requiredFields={[...requiredFields]}
    />
  )
}

export const dynamic = 'force-dynamic'
