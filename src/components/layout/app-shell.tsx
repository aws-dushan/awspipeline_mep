'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { NAV_SECTIONS, resolveHref } from '@/components/layout/nav-config'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/primitives'
import { useLiveChannel } from '@/hooks/use-live-channel'
import { withBasePath } from '@/lib/base-path'
import type { CompanyAccess } from '@/lib/auth/session'
import {
  LAST_COMPANY_COOKIE,
  LAST_COMPANY_COOKIE_MAX_AGE,
  LAST_COMPANY_COOKIE_PATH,
} from '@/lib/company/last-company'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import type { Role } from '@prisma/client'

export type ShellUser = {
  id: string
  name: string
  email: string
  role: Role
  avatarColor: string
}

export function AppShell({
  user,
  company,
  companies,
  pendingDeleteRequests,
  children,
}: {
  user: ShellUser
  company: CompanyAccess
  companies: CompanyAccess[]
  pendingDeleteRequests: number
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const [pendingCount, setPendingCount] = React.useState(pendingDeleteRequests)

  React.useEffect(() => setPendingCount(pendingDeleteRequests), [pendingDeleteRequests])
  React.useEffect(() => setMobileNavOpen(false), [pathname])

  /**
   * Shell-level live subscription.
   *
   * This is the connection every other component on the page shares (the hook
   * keeps one EventSource per company), and it keeps the approvals badge
   * accurate without the user reloading.
   */
  /*
   * Remember which company this is.
   *
   * The global admin screens sit outside `/c/[companyId]` and cannot know it
   * from the URL, so they read this back. Written from the browser because a
   * Server Component may not set a cookie, and it is only a breadcrumb - the
   * server still checks that whoever presents it may reach that company.
   */
  React.useEffect(() => {
    document.cookie =
      `${LAST_COMPANY_COOKIE}=${company.id}; path=${LAST_COMPANY_COOKIE_PATH};` +
      ` max-age=${LAST_COMPANY_COOKIE_MAX_AGE}; samesite=lax`
  }, [company.id])

  const liveStatus = useLiveChannel(company.id, {
    channels: ['delete-requests'],
    onEvent: (event) => {
      if (event.actorId === user.id) return

      if (event.action === 'delete-request.created' && can(user, 'delete:review')) {
        setPendingCount((count) => count + 1)
        toast.warning('New deletion request', {
          description: 'A team member has asked for a record to be deleted.',
          action: {
            label: 'Review',
            onClick: () => {
              // A real navigation, not the router: the prefix is ours to add.
              window.location.href = withBasePath(`/c/${company.id}/delete-requests`)
            },
          },
        })
      }

      if (event.action === 'delete-request.decided') {
        setPendingCount((count) => Math.max(0, count - 1))
      }
    },
  })

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={200}>
      <div className="flex min-h-dvh flex-col bg-canvas">
        <TopBar
          user={user}
          company={company}
          companies={companies}
          pendingDeleteRequests={pendingCount}
          liveStatus={liveStatus}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        {/* No sidebar: navigation sits in the top bar so the pipeline grid
            gets the full window width. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>

        <MobileNav
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          companyId={company.id}
          role={user.role}
          pathname={pathname}
          pendingDeleteRequests={pendingCount}
        />
      </div>
    </TooltipProvider>
  )
}

function MobileNav({
  open,
  onClose,
  companyId,
  role,
  pathname,
  pendingDeleteRequests,
}: {
  open: boolean
  onClose: () => void
  companyId: string
  role: Role
  pathname: string
  pendingDeleteRequests: number
}) {
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can({ role }, item.permission)),
  })).filter((section) => section.items.length > 0)

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink-900/25 backdrop-blur-[2px] lg:hidden"
          />
          <motion.nav
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.26, ease: [0.25, 1, 0.5, 1] }}
            className="fixed inset-y-0 left-0 z-50 flex w-[276px] flex-col border-r border-ink-100 bg-white lg:hidden"
          >
            <div className="flex h-14 items-center justify-between border-b border-ink-100 px-4">
              <span className="text-[13px] font-semibold text-ink-900">Menu</span>
              <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close menu">
                <X />
              </Button>
            </div>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-3 scroll-polished">
              {sections.map((section) => (
                <div key={section.title ?? 'main'} className="flex flex-col gap-1">
                  {section.title ? (
                    <p className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-400">
                      {section.title}
                    </p>
                  ) : null}
                  {section.items.map((item) => {
                    const href = resolveHref(item, companyId)
                    const active = pathname === href || pathname.startsWith(`${href}/`)
                    const Icon = item.icon
                    const badge = item.badge ? pendingDeleteRequests : 0
                    return (
                      <Link
                        key={item.key}
                        href={href}
                        className={cn(
                          'flex h-10 items-center gap-3 rounded-md px-2.5 text-[14px] font-medium transition-colors',
                          active
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                        )}
                      >
                        <Icon
                          className={cn('size-[18px]', active ? 'text-brand-600' : 'text-ink-400')}
                        />
                        {item.label}
                        {badge > 0 ? (
                          <span className="ml-auto grid min-w-[18px] place-items-center rounded-full bg-warning px-1.5 text-[10.5px] font-bold text-white">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        ) : null}
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>
          </motion.nav>
        </>
      ) : null}
    </AnimatePresence>
  )
}
