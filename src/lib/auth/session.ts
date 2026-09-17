import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Role } from '@prisma/client'

import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/database/prisma'
import { can, type Permission } from '@/lib/permissions'

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: Role
  displayCode: string | null
  avatarColor: string
  sessionId: string
  /** Companies this user may access, already filtered to active ones. */
  companies: CompanyAccess[]
  supervisorId: string | null
  supervisorName: string | null
}

export type CompanyAccess = {
  id: string
  name: string
  color: string
  currency: string
  logoUrl: string | null
  isDefault: boolean
}

export class AuthorizationError extends Error {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'You are not signed in.') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * Resolve the signed-in user from the JWT *and re-check the database*.
 *
 * The JWT alone is not trusted for authorisation: the session row must still
 * exist and be unexpired, and the account must still be active. That makes
 * deactivating a user or revoking a session take effect on the next request
 * rather than whenever the token happens to expire.
 *
 * Wrapped in `cache()` so a single render/request hits the database once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth()
  if (!session?.user?.id || !session.user.sessionId) return null

  const authSession = await prisma.authSession.findUnique({
    relationLoadStrategy: 'join',
    where: { id: session.user.sessionId },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          displayCode: true,
          avatarColor: true,
          supervisorLinks: {
            select: { supervisor: { select: { id: true, name: true } } },
            take: 1,
          },
          userCompanies: {
            where: { company: { isActive: true } },
            orderBy: [{ isDefault: 'desc' }, { company: { name: 'asc' } }],
            select: {
              isDefault: true,
              company: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                  currency: true,
                  logoUrl: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!authSession) return null
  if (authSession.expiresAt.getTime() < Date.now()) {
    await prisma.authSession.delete({ where: { id: authSession.id } }).catch(() => undefined)
    return null
  }
  if (!authSession.user.isActive) return null

  const user = authSession.user
  const supervisor = user.supervisorLinks[0]?.supervisor ?? null

  // Administrators are implicitly members of every active company: they
  // configure the system and must be able to reach any company's settings.
  const companies: CompanyAccess[] =
    user.role === 'ADMIN'
      ? (
          await prisma.company.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              color: true,
              currency: true,
              logoUrl: true,
            },
          })
        ).map((company) => ({
          ...company,
          isDefault: user.userCompanies.some(
            (uc) => uc.company.id === company.id && uc.isDefault,
          ),
        }))
      : user.userCompanies.map((uc) => ({ ...uc.company, isDefault: uc.isDefault }))

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    displayCode: user.displayCode,
    avatarColor: user.avatarColor,
    sessionId: authSession.id,
    companies,
    supervisorId: supervisor?.id ?? null,
    supervisorName: supervisor?.name ?? null,
  }
})

/** Page-level guard: redirects to the login screen when not signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/**
 * Action/route-level guard: throws instead of redirecting, so callers can
 * return a structured error to the client.
 */
export async function requireUserOrThrow(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthenticationError()
  return user
}

export type CompanyContext = {
  user: CurrentUser
  company: CompanyAccess
}

/**
 * THE company authorisation gate.
 *
 * Every server action, route handler and page that touches company-scoped data
 * must call this - it is the only place allowed to decide that a user may see
 * a company. Frontend filtering is never sufficient.
 */
export async function requireCompanyAccess(companyId: string): Promise<CompanyContext> {
  const user = await requireUserOrThrow()
  const company = user.companies.find((c) => c.id === companyId)
  if (!company) {
    // Deliberately identical to "not found": do not confirm that a company id
    // exists to someone who is not entitled to it.
    throw new AuthorizationError('Company not found or access denied.')
  }
  return { user, company }
}

/** Page variant: redirects rather than throwing. */
export async function requireCompanyPage(companyId: string): Promise<CompanyContext> {
  const user = await requireUser()
  const company = user.companies.find((c) => c.id === companyId)
  if (!company) redirect('/select-company?error=no_access')
  return { user, company }
}

export function requirePermission(user: CurrentUser, permission: Permission): void {
  if (!can(user, permission)) {
    throw new AuthorizationError()
  }
}

export async function requireCompanyPermission(
  companyId: string,
  permission: Permission,
): Promise<CompanyContext> {
  const context = await requireCompanyAccess(companyId)
  requirePermission(context.user, permission)
  return context
}

/** Ids of the users who report to this user (direct reports only). */
export async function getSubordinateIds(userId: string): Promise<string[]> {
  const links = await prisma.supervisorAssignment.findMany({
    where: { supervisorId: userId },
    select: { userId: true },
  })
  return links.map((link) => link.userId)
}
