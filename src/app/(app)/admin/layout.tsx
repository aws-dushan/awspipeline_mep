import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { requireUser } from '@/lib/auth/session'
import { resolveCurrentCompany } from '@/lib/company/current-company'
import { can } from '@/lib/permissions'

/**
 * Global admin area.
 *
 * Companies and users are not company-scoped, and an administrator needs to
 * reach them before any company exists - so these screens sit outside
 * `/c/[companyId]`. The shell still needs a company for its switcher and for
 * every link in the top bar, so it shows the one the user was last working
 * in. Taking the first in the list put them in a different company than the
 * one they came from, and pointed the Pipeline link there too.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  if (!can(user, 'company:manage') && !can(user, 'user:manage')) {
    redirect('/select-company')
  }

  const company = await resolveCurrentCompany(user.companies)

  // With no company at all there is no shell to render - show the bare screen
  // so the admin can create the first one.
  if (!company) {
    return <div className="min-h-dvh bg-canvas">{children}</div>
  }

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
      pendingDeleteRequests={0}
    >
      {children}
    </AppShell>
  )
}

export const dynamic = 'force-dynamic'
