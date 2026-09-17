import {
  Building2,
  History,
  LayoutGrid,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { Permission } from '@/lib/permissions'

export type NavItem = {
  key: string
  label: string
  icon: LucideIcon
  /** `:companyId` is substituted at render time. */
  href: string
  permission: Permission
  /** Global admin destinations sit outside the company scope. */
  global?: boolean
  /** Key of the badge count supplied by the shell, if any. */
  badge?: 'pendingDeleteRequests'
}

export type NavSection = { title: string | null; items: NavItem[] }

/**
 * Navigation lives in the top bar so the pipeline grid gets the full window
 * width - with 17 columns, horizontal space is the scarcest thing on screen.
 *
 * The first section renders as inline links; the "Administration" section
 * collapses into a single dropdown, keeping the bar to one row.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      {
        key: 'pipeline',
        label: 'Pipeline',
        icon: LayoutGrid,
        href: '/c/:companyId/pipeline',
        permission: 'pipeline:view',
      },
      {
        key: 'delete-requests',
        label: 'Delete Requests',
        icon: Trash2,
        href: '/c/:companyId/delete-requests',
        permission: 'delete:request',
        badge: 'pendingDeleteRequests',
      },
      {
        key: 'customers',
        label: 'Customers',
        icon: Building2,
        href: '/c/:companyId/customers',
        permission: 'pipeline:view',
      },
      {
        key: 'audit',
        label: 'Audit',
        icon: History,
        href: '/c/:companyId/audit',
        permission: 'audit:view',
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        key: 'dropdowns',
        label: 'Dropdowns',
        icon: SlidersHorizontal,
        href: '/c/:companyId/admin/dropdowns',
        permission: 'dropdown:manage',
      },
      {
        key: 'companies',
        label: 'Companies',
        icon: ShieldCheck,
        href: '/admin/companies',
        permission: 'company:manage',
        global: true,
      },
      {
        key: 'users',
        label: 'Users',
        icon: Users,
        href: '/admin/users',
        permission: 'user:manage',
        global: true,
      },
    ],
  },
]

export function resolveHref(item: NavItem, companyId: string) {
  return item.href.replace(':companyId', companyId)
}

/** Inline links in the top bar. */
export const PRIMARY_NAV = NAV_SECTIONS[0].items

/** Grouped behind the "Admin" dropdown. */
export const ADMIN_NAV = NAV_SECTIONS[1].items

/**
 * A nav item is current when the path matches it exactly or sits beneath it.
 * `/c/x/admin/dropdowns` must not also light up `/c/x/pipeline`.
 */
export function isNavItemActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
