import { AppShell } from '@/components/layout/app-shell'
import { requireCompanyPage } from '@/lib/auth/session'
import { countPendingDeleteRequests } from '@/server/actions/delete-request-actions'

/**
 * Company-scoped layout.
 *
 * `requireCompanyPage` is the gate: it resolves the signed-in user, confirms
 * the company id in the URL is one they may access, and redirects otherwise.
 * Nothing below this point needs to re-check membership.
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const { user, company } = await requireCompanyPage(companyId)
  const pendingDeleteRequests = await countPendingDeleteRequests(company.id).catch(() => 0)

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarColor: user.avatarColor,
      }}
      company={company}
      companies={user.companies}
      pendingDeleteRequests={pendingDeleteRequests}
    >
      {children}
    </AppShell>
  )
}

export const dynamic = 'force-dynamic'
