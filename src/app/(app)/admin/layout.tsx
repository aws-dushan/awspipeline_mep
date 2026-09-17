import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { requireUser } from '@/lib/auth/session'
import { can } from '@/lib/permissions'

/**
 * Global admin area.
 *
 * Companies and users are not company-scoped, and an administrator needs to
 * reach them before any company exists - so these screens sit outside
 * `/c/[companyId]`. The shell still needs a company for its switcher, so it
 * falls back to the first one the admin can see.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  if (!can(user, 'company:manage') && !can(user, 'user:manage')) {
    redirect('/select-company')
  }

  const company = user.companies[0] ?? null

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
