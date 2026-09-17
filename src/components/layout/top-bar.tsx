'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { signOut } from 'next-auth/react'
import {
  Bell,
  Check,
  ChevronDown,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  Menu,
  Radio,
  Settings2,
  Trash2,
  WifiOff,
} from 'lucide-react'

import { ChangePasswordDialog } from '@/components/auth/change-password-dialog'
import {
  ADMIN_NAV,
  isNavItemActive,
  PRIMARY_NAV,
  resolveHref,
  type NavItem,
} from '@/components/layout/nav-config'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, Tooltip } from '@/components/ui/primitives'
import type { CompanyAccess } from '@/lib/auth/session'
import { brand } from '@/lib/branding'
import { can, ROLE_LABELS } from '@/lib/permissions'
import { cn, hexWithAlpha } from '@/lib/utils'
import type { LiveStatus } from '@/hooks/use-live-channel'
import type { Role } from '@prisma/client'

export function TopBar({
  user,
  company,
  companies,
  pendingDeleteRequests,
  liveStatus,
  onOpenMobileNav,
}: {
  user: { id: string; name: string; email: string; role: Role; avatarColor: string }
  company: CompanyAccess
  companies: CompanyAccess[]
  pendingDeleteRequests: number
  liveStatus: LiveStatus
  onOpenMobileNav: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [passwordOpen, setPasswordOpen] = React.useState(false)

  const primaryItems = PRIMARY_NAV.filter((item) => can(user, item.permission))
  const adminItems = ADMIN_NAV.filter((item) => can(user, item.permission))

  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-ink-100 px-3 sm:px-4">
      <Button
        variant="ghost"
        size="iconSm"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      {/* Mark only. The company switcher immediately to its right already
          names the context, and repeating the brand wordmark next to it reads
          as a duplicate whenever a company shares the brand name. */}
      <Link
        href={`/c/${company.id}/pipeline`}
        aria-label={`${brand.name} home`}
        className="shrink-0 rounded-md p-1 transition-opacity hover:opacity-80"
      >
        <Image
          src={brand.mark}
          alt={brand.name}
          width={64}
          height={64}
          className="size-8"
        />
      </Link>

      <CompanySwitcher company={company} companies={companies} />

      <span className="mx-1 hidden h-6 w-px shrink-0 bg-ink-200 lg:block" aria-hidden />

      {/* --- Primary navigation ------------------------------------------- */}
      <nav
        aria-label="Main"
        className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex"
      >
        {primaryItems.map((item) => (
          <TopNavLink
            key={item.key}
            item={item}
            companyId={company.id}
            pathname={pathname}
            badge={item.badge ? pendingDeleteRequests : 0}
          />
        ))}

        {adminItems.length > 0 ? (
          <AdminNavMenu items={adminItems} companyId={company.id} pathname={pathname} />
        ) : null}
      </nav>

      {/* --- Right cluster -------------------------------------------------- */}
      <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
        <LiveIndicator status={liveStatus} />

        <Tooltip content="Delete requests">
          <Link
            href={`/c/${company.id}/delete-requests`}
            className="relative grid size-9 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
            aria-label={`Delete requests${
              pendingDeleteRequests > 0 ? `, ${pendingDeleteRequests} pending` : ''
            }`}
          >
            <Bell className="size-[17px]" />
            {pendingDeleteRequests > 0 ? (
              <span className="absolute right-1.5 top-1.5 grid size-[15px] place-items-center rounded-full bg-warning text-[9px] font-bold text-white ring-2 ring-white">
                {pendingDeleteRequests > 9 ? '9+' : pendingDeleteRequests}
              </span>
            ) : null}
          </Link>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors',
                'hover:bg-ink-100 data-[state=open]:bg-ink-100',
              )}
            >
              <Avatar name={user.name} color={user.avatarColor} size="md" />
              <span className="hidden min-w-0 flex-col items-start xl:flex">
                <span className="max-w-[130px] truncate text-[12.5px] font-semibold leading-tight text-ink-900">
                  {user.name}
                </span>
                <span className="text-[10.5px] leading-tight text-ink-400">
                  {ROLE_LABELS[user.role]}
                </span>
              </span>
              <ChevronsUpDown className="hidden size-3.5 text-ink-400 xl:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center gap-3 px-2 py-2.5">
              <Avatar name={user.name} color={user.avatarColor} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink-900">{user.name}</p>
                <p className="truncate text-[12px] text-ink-400">{user.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
              <KeyRound />
              Change password
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={() => router.push(`/c/${company.id}/delete-requests`)}>
              <Trash2 />
              Delete requests
            </DropdownMenuItem>

            {companies.length > 1 ? (
              <DropdownMenuItem onSelect={() => router.push('/select-company?stay=1')}>
                <ChevronsUpDown />
                Switch company
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => signOut({ callbackUrl: '/login' })}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                */
/* -------------------------------------------------------------------------- */

function TopNavLink({
  item,
  companyId,
  pathname,
  badge,
}: {
  item: NavItem
  companyId: string
  pathname: string
  badge: number
}) {
  const href = resolveHref(item, companyId)
  const active = isNavItemActive(href, pathname)
  const Icon = item.icon

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium',
        'transition-colors duration-150 ease-out-quart',
        active ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-100/70 hover:text-ink-900',
      )}
    >
      {/* Shared layout id slides the active pill between items rather than
          cross-fading two separate backgrounds. */}
      {active ? (
        <motion.span
          layoutId="topnav-active"
          transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
          className="absolute inset-0 rounded-md bg-brand-50"
        />
      ) : null}

      <Icon
        className={cn(
          'relative size-[16px] shrink-0 transition-colors',
          active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
        )}
      />
      <span className="relative whitespace-nowrap">{item.label}</span>

      {badge > 0 ? (
        <span className="relative grid min-w-[17px] place-items-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  )
}

function AdminNavMenu({
  items,
  companyId,
  pathname,
}: {
  items: NavItem[]
  companyId: string
  pathname: string
}) {
  const router = useRouter()
  const active = items.some((item) => isNavItemActive(resolveHref(item, companyId), pathname))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'group relative flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium',
            'transition-colors duration-150 ease-out-quart',
            active
              ? 'text-brand-700'
              : 'text-ink-600 hover:bg-ink-100/70 hover:text-ink-900 data-[state=open]:bg-ink-100/70',
          )}
        >
          {active ? (
            <motion.span
              layoutId="topnav-active"
              transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
              className="absolute inset-0 rounded-md bg-brand-50"
            />
          ) : null}

          <Settings2
            className={cn(
              'relative size-[16px] shrink-0 transition-colors',
              active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
            )}
          />
          <span className="relative whitespace-nowrap">Admin</span>
          <ChevronDown className="relative size-3.5 shrink-0 text-ink-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Administration</DropdownMenuLabel>
        {items.map((item) => {
          const href = resolveHref(item, companyId)
          const Icon = item.icon
          return (
            <DropdownMenuItem
              key={item.key}
              onSelect={() => router.push(href)}
              className={cn(isNavItemActive(href, pathname) && 'bg-brand-50 text-brand-800')}
            >
              <Icon />
              {item.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* -------------------------------------------------------------------------- */
/*  Company switcher                                                          */
/* -------------------------------------------------------------------------- */

function CompanySwitcher({
  company,
  companies,
}: {
  company: CompanyAccess
  companies: CompanyAccess[]
}) {
  const router = useRouter()
  const multiple = companies.length > 1

  const chip = (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-[6px] text-[10.5px] font-bold"
      style={{ backgroundColor: hexWithAlpha(company.color, 0.14), color: company.color }}
    >
      {company.code.slice(0, 2)}
    </span>
  )

  if (!multiple) {
    return (
      <div className="flex min-w-0 shrink items-center gap-2 rounded-md px-2 py-1.5">
        {chip}
        <span className="hidden max-w-[180px] truncate text-[13.5px] font-medium text-ink-800 sm:block">
          {company.name}
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex min-w-0 shrink items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
            'hover:bg-ink-100 data-[state=open]:bg-ink-100',
          )}
        >
          {chip}
          <span className="hidden max-w-[180px] truncate text-[13.5px] font-medium text-ink-800 sm:block">
            {company.name}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-400" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[268px]">
        <DropdownMenuLabel>Switch company</DropdownMenuLabel>
        {companies.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => {
              if (option.id === company.id) return
              router.push(`/c/${option.id}/pipeline`)
            }}
          >
            <span
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-[10.5px] font-bold"
              style={{
                backgroundColor: hexWithAlpha(option.color, 0.14),
                color: option.color,
              }}
            >
              {option.code.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink-800">
                {option.name}
              </span>
              <span className="block text-[11px] text-ink-400">
                {option.code} · {option.currency}
              </span>
            </span>
            {option.id === company.id ? (
              <Check className="size-3.5 shrink-0 text-brand-600" />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/select-company?stay=1')}>
          <ChevronsUpDown />
          All companies
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* -------------------------------------------------------------------------- */
/*  Live indicator                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Shows whether the grid is receiving live pushes.
 *
 * Worth surfacing: a user who knows the board updates itself will not sit
 * pressing refresh, and if the stream drops they can see why the numbers
 * stopped moving.
 */
function LiveIndicator({ status }: { status: LiveStatus }) {
  const label =
    status === 'live'
      ? 'Live - updates appear automatically'
      : status === 'connecting'
        ? 'Connecting to live updates...'
        : 'Live updates unavailable. Data refreshes every minute.'

  return (
    <Tooltip content={label}>
      <span
        className={cn(
          'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:flex',
          status === 'live' && 'bg-positive-soft text-positive',
          status === 'connecting' && 'bg-ink-100 text-ink-500',
          status === 'offline' && 'bg-warning-soft text-warning',
        )}
      >
        {status === 'offline' ? (
          <WifiOff className="size-3" />
        ) : status === 'connecting' ? (
          <Radio className="size-3 animate-pulse" />
        ) : (
          <span className="live-dot size-1.5 rounded-full bg-positive" aria-hidden />
        )}
        <span className="hidden 2xl:inline">
          {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
        </span>
      </span>
    </Tooltip>
  )
}
