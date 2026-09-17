import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CompanySelector } from '@/components/auth/company-selector'
import { requireUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Select company' }

export default async function SelectCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; stay?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams

  // One company and nothing to choose: skip the picker entirely. `stay=1` is
  // set by the in-app company switcher so it can still reach this screen.
  if (user.companies.length === 1 && !params.error && !params.stay) {
    redirect(`/c/${user.companies[0].id}/pipeline`)
  }

  return (
    <CompanySelector
      userName={user.name}
      companies={user.companies}
      isAdmin={user.role === 'ADMIN'}
    />
  )
}

export const dynamic = 'force-dynamic'
