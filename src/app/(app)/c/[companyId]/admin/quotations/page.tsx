import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { QuotationSettingsForm } from '@/components/admin/quotation-settings-form'
import { requireCompanyPage } from '@/lib/auth/session'
import { getQuotationSettings } from '@/lib/database/quotation-repository'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Quotation settings' }

export default async function QuotationSettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const { user, company } = await requireCompanyPage(companyId)
  if (!can(user, 'quotation:settings')) redirect(`/c/${company.id}/pipeline`)

  const settings = await getQuotationSettings(company.id)

  return <QuotationSettingsForm companyId={company.id} companyName={company.name} initial={settings} />
}

export const dynamic = 'force-dynamic'
