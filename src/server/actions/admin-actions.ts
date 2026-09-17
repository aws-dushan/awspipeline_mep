'use server'

import { revalidatePath } from 'next/cache'
import { DropdownTypeKey, Prisma } from '@prisma/client'

import { diffRecords, writeAudit } from '@/lib/audit'
import { hashPassword } from '@/lib/auth/password'
import {
  AuthorizationError,
  requirePermission,
  requireUserOrThrow,
} from '@/lib/auth/session'
import { seedDefaultAutomationRules } from '@/lib/database/automation-repository'
import { buildDefaultDropdownRows } from '@/lib/database/dropdown-defaults'
import { prisma } from '@/lib/database/prisma'
import { ROLE_LABELS } from '@/lib/permissions'
import {
  createCompanySchema,
  createUserSchema,
  resetPasswordSchema,
  toggleUserSchema,
  updateCompanySchema,
  updateUserSchema,
} from '@/lib/validation/admin'
import {
  ConflictError,
  NotFoundError,
  runAction,
  type ActionResult,
} from '@/server/actions/action-result'

// -----------------------------------------------------------------------------
//  Companies
// -----------------------------------------------------------------------------

async function dropdownTypeIds(): Promise<Record<DropdownTypeKey, string>> {
  const types = await prisma.dropdownType.findMany({ select: { id: true, key: true } })
  return Object.fromEntries(types.map((type) => [type.key, type.id])) as Record<
    DropdownTypeKey,
    string
  >
}

export async function createCompanyAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction('createCompany', async () => {
    const user = await requireUserOrThrow()
    requirePermission(user, 'company:manage')
    const parsed = createCompanySchema.parse(input)

    const typeIds = await dropdownTypeIds()

    try {
      const company = await prisma.$transaction(async (tx) => {
        const created = await tx.company.create({
          data: {
            name: parsed.name,
            color: parsed.color,
            currency: parsed.currency,
            isActive: parsed.isActive,
            counter: {
              create: {
                nextSerialNo: 1,
                nextJobNo: parsed.jobNoStart,
                jobNoPrefix: parsed.jobNoPrefix,
                jobNoSuffix: parsed.jobNoSuffix,
              },
            },
          },
          select: { id: true, name: true },
        })

        // A company with no dropdown values cannot be used, so give it the
        // starter set immediately. All of it is editable afterwards.
        await tx.dropdownValue.createMany({
          data: buildDefaultDropdownRows(created.id, typeIds),
        })
        // Along with the default Status/Probability linkage, which the admin
        // can edit or switch off in Dropdown Settings.
        await seedDefaultAutomationRules(tx, created.id, user.id)

        await writeAudit(
          {
            actorId: user.id,
            companyId: created.id,
            action: 'COMPANY_CREATED',
            entity: 'COMPANY',
            entityId: created.id,
            summary: `${user.name} created company ${created.name}`,
            metadata: { currency: parsed.currency },
          },
          tx,
        )

        return created
      })

      revalidatePath('/select-company')
      return company
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(`A company named "${parsed.name}" already exists.`)
      }
      throw error
    }
  })
}

export async function updateCompanyAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction('updateCompany', async () => {
    const user = await requireUserOrThrow()
    requirePermission(user, 'company:manage')
    const parsed = updateCompanySchema.parse(input)

    const existing = await prisma.company.findUnique({
      where: { id: parsed.companyId },
      select: {
        id: true,
        name: true,
        color: true,
        currency: true,
        isActive: true,
        counter: { select: { jobNoPrefix: true, jobNoSuffix: true } },
      },
    })
    if (!existing) throw new NotFoundError('That company no longer exists.')

    const changes = diffRecords(
      {
        name: existing.name,
        color: existing.color,
        currency: existing.currency,
        isActive: existing.isActive,
        jobNoPrefix: existing.counter?.jobNoPrefix ?? '',
        jobNoSuffix: existing.counter?.jobNoSuffix ?? '',
      },
      {
        name: parsed.name,
        color: parsed.color,
        currency: parsed.currency,
        isActive: parsed.isActive,
        jobNoPrefix: parsed.jobNoPrefix,
        jobNoSuffix: parsed.jobNoSuffix,
      },
      [
        { field: 'name', label: 'Name' },
        { field: 'color', label: 'Accent colour' },
        { field: 'currency', label: 'Currency' },
        { field: 'isActive', label: 'Active' },
        { field: 'jobNoPrefix', label: 'Job No prefix' },
        { field: 'jobNoSuffix', label: 'Job No suffix' },
      ],
    )

    try {
      await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: existing.id },
          data: {
            name: parsed.name,
            color: parsed.color,
            currency: parsed.currency,
            isActive: parsed.isActive,
          },
        })
        // The next job number is deliberately not editable here: moving it
        // backwards could collide with numbers already issued.
        await tx.companyCounter.upsert({
          where: { companyId: existing.id },
          create: {
            companyId: existing.id,
            jobNoPrefix: parsed.jobNoPrefix,
            jobNoSuffix: parsed.jobNoSuffix,
          },
          update: { jobNoPrefix: parsed.jobNoPrefix, jobNoSuffix: parsed.jobNoSuffix },
        })

        if (changes.length > 0) {
          await writeAudit(
            {
              actorId: user.id,
              companyId: existing.id,
              action: 'COMPANY_UPDATED',
              entity: 'COMPANY',
              entityId: existing.id,
              summary: `${user.name} updated company ${parsed.name}`,
              changes,
            },
            tx,
          )
        }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(`A company named "${parsed.name}" already exists.`)
      }
      throw error
    }

    revalidatePath('/select-company')
    revalidatePath(`/c/${existing.id}/admin/companies`)
    return { id: existing.id }
  })
}

// -----------------------------------------------------------------------------
//  Users
// -----------------------------------------------------------------------------

/**
 * Derive the short code shown in the pipeline from the user's name.
 *
 * Generated rather than typed: it is a display detail, and asking an admin to
 * invent a unique code for every account is friction for no benefit. A numeric
 * suffix is added only when the natural code is already taken.
 */
async function generateDisplayCode(name: string, excludeUserId?: string): Promise<string> {
  const base =
    name
      .trim()
      .split(/\s+/)[0]
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 10) || 'USER'

  const taken = await prisma.user.findMany({
    where: {
      displayCode: { startsWith: base },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { displayCode: true },
  })
  const used = new Set(taken.map((user) => user.displayCode))

  if (!used.has(base)) return base
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 10)}${suffix}`
    if (!used.has(candidate)) return candidate
  }
  return `${base.slice(0, 8)}${Date.now().toString(36).slice(-3).toUpperCase()}`
}

/** Reject a supervisor chain that would loop back on itself. */
async function assertNoSupervisorCycle(userId: string, supervisorId: string | null) {
  if (!supervisorId) return
  if (supervisorId === userId) {
    throw new ConflictError('A user cannot report to themselves.')
  }

  let cursor: string | null = supervisorId
  const seen = new Set<string>([userId])

  for (let depth = 0; cursor && depth < 20; depth += 1) {
    if (seen.has(cursor)) {
      throw new ConflictError('That reporting line would create a loop.')
    }
    seen.add(cursor)
    const next: { supervisorId: string } | null = await prisma.supervisorAssignment.findUnique({
      where: { userId: cursor },
      select: { supervisorId: true },
    })
    cursor = next?.supervisorId ?? null
  }
}

async function applyCompanyAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
  companyIds: string[],
  defaultCompanyId: string | null,
) {
  const existing = await tx.userCompany.findMany({
    where: { userId },
    select: { companyId: true },
  })
  const existingIds = new Set(existing.map((row) => row.companyId))
  const nextIds = new Set(companyIds)

  const toRemove = [...existingIds].filter((id) => !nextIds.has(id))
  const toAdd = [...nextIds].filter((id) => !existingIds.has(id))

  if (toRemove.length > 0) {
    await tx.userCompany.deleteMany({ where: { userId, companyId: { in: toRemove } } })
  }
  if (toAdd.length > 0) {
    await tx.userCompany.createMany({
      data: toAdd.map((companyId) => ({ userId, companyId })),
      skipDuplicates: true,
    })
  }

  await tx.userCompany.updateMany({ where: { userId }, data: { isDefault: false } })
  if (defaultCompanyId && nextIds.has(defaultCompanyId)) {
    await tx.userCompany.updateMany({
      where: { userId, companyId: defaultCompanyId },
      data: { isDefault: true },
    })
  }

  return { added: toAdd, removed: toRemove }
}

async function applySupervisor(
  tx: Prisma.TransactionClient,
  userId: string,
  supervisorId: string | null,
) {
  if (supervisorId) {
    await tx.supervisorAssignment.upsert({
      where: { userId },
      create: { userId, supervisorId },
      update: { supervisorId },
    })
  } else {
    await tx.supervisorAssignment.deleteMany({ where: { userId } })
  }
}

export async function createUserAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction('createUser', async () => {
    const actor = await requireUserOrThrow()
    requirePermission(actor, 'user:manage')
    const parsed = createUserSchema.parse(input)

    if (parsed.supervisorId) {
      const supervisor = await prisma.user.findUnique({
        where: { id: parsed.supervisorId },
        select: { id: true, role: true },
      })
      if (!supervisor) throw new NotFoundError('The selected supervisor no longer exists.')
    }

    const passwordHash = await hashPassword(parsed.password)
    const displayCode = await generateDisplayCode(parsed.name)

    try {
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: parsed.name,
            username: parsed.username,
            email: parsed.email,
            displayCode,
            role: parsed.role,
            isActive: parsed.isActive,
            passwordHash,
          },
          select: { id: true, name: true },
        })

        await applyCompanyAssignments(tx, user.id, parsed.companyIds, parsed.defaultCompanyId)
        await applySupervisor(tx, user.id, parsed.supervisorId)

        await writeAudit(
          {
            actorId: actor.id,
            companyId: parsed.companyIds[0] ?? null,
            action: 'USER_CREATED',
            entity: 'USER',
            entityId: user.id,
            summary: `${actor.name} created ${ROLE_LABELS[parsed.role].toLowerCase()} account for ${user.name}`,
            metadata: {
              email: parsed.email,
              role: parsed.role,
              companyCount: parsed.companyIds.length,
            },
          },
          tx,
        )

        return user
      })

      revalidatePath('/select-company')
      return created
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(',') ?? ''
        throw new ConflictError(
          target.includes('username')
            ? `The username "${parsed.username}" is already taken.`
            : 'An account with that email address already exists.',
        )
      }
      throw error
    }
  })
}

export async function updateUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction('updateUser', async () => {
    const actor = await requireUserOrThrow()
    requirePermission(actor, 'user:manage')
    const parsed = updateUserSchema.parse(input)

    const existing = await prisma.user.findUnique({
      where: { id: parsed.userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        displayCode: true,
        role: true,
        isActive: true,
        userCompanies: { select: { companyId: true, isDefault: true } },
        supervisorLinks: { select: { supervisorId: true }, take: 1 },
      },
    })
    if (!existing) throw new NotFoundError('That user no longer exists.')

    // Guard against an admin locking everyone out of administration.
    if (existing.role === 'ADMIN' && parsed.role !== 'ADMIN') {
      const otherAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: existing.id } },
      })
      if (otherAdmins === 0) {
        throw new ConflictError('This is the last active administrator - keep at least one.')
      }
    }

    await assertNoSupervisorCycle(existing.id, parsed.supervisorId)

    // Keep the code aligned with the name, but only when the name changed -
    // regenerating on every save would churn codes people have learned.
    const displayCode =
      existing.name.trim() === parsed.name.trim() && existing.displayCode
        ? existing.displayCode
        : await generateDisplayCode(parsed.name, existing.id)

    const previousSupervisorId = existing.supervisorLinks[0]?.supervisorId ?? null
    const changes = diffRecords(
      {
        name: existing.name,
        username: existing.username,
        email: existing.email,
        displayCode: existing.displayCode,
        role: existing.role,
        isActive: existing.isActive,
      },
      {
        name: parsed.name,
        username: parsed.username,
        email: parsed.email,
        displayCode,
        role: parsed.role,
        isActive: parsed.isActive,
      },
      [
        { field: 'name', label: 'Name' },
        { field: 'username', label: 'Username' },
        { field: 'email', label: 'Email' },
        { field: 'displayCode', label: 'Display code' },
        { field: 'role', label: 'Role' },
        { field: 'isActive', label: 'Active' },
      ],
    )

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: existing.id },
          data: {
            name: parsed.name,
            username: parsed.username,
            email: parsed.email,
            displayCode,
            role: parsed.role,
            isActive: parsed.isActive,
          },
        })

        const assignments = await applyCompanyAssignments(
          tx,
          existing.id,
          parsed.companyIds,
          parsed.defaultCompanyId,
        )
        await applySupervisor(tx, existing.id, parsed.supervisorId)

        // Revoking access must take effect immediately, not at token expiry.
        if (!parsed.isActive || assignments.removed.length > 0) {
          await tx.authSession.deleteMany({ where: { userId: existing.id } })
        }

        if (changes.length > 0) {
          await writeAudit(
            {
              actorId: actor.id,
              companyId: parsed.companyIds[0] ?? null,
              action: 'USER_UPDATED',
              entity: 'USER',
              entityId: existing.id,
              summary: `${actor.name} updated the account for ${parsed.name}`,
              changes,
            },
            tx,
          )
        }

        for (const companyId of assignments.added) {
          await writeAudit(
            {
              actorId: actor.id,
              companyId,
              action: 'USER_COMPANY_ASSIGNED',
              entity: 'USER_COMPANY',
              entityId: existing.id,
              summary: `${actor.name} gave ${parsed.name} access to this company`,
            },
            tx,
          )
        }
        for (const companyId of assignments.removed) {
          await writeAudit(
            {
              actorId: actor.id,
              companyId,
              action: 'USER_COMPANY_REVOKED',
              entity: 'USER_COMPANY',
              entityId: existing.id,
              summary: `${actor.name} removed ${parsed.name}'s access to this company`,
            },
            tx,
          )
        }

        if (previousSupervisorId !== parsed.supervisorId) {
          await writeAudit(
            {
              actorId: actor.id,
              companyId: parsed.companyIds[0] ?? null,
              action: parsed.supervisorId ? 'SUPERVISOR_ASSIGNED' : 'SUPERVISOR_REMOVED',
              entity: 'SUPERVISOR_ASSIGNMENT',
              entityId: existing.id,
              summary: parsed.supervisorId
                ? `${actor.name} changed who ${parsed.name} reports to`
                : `${actor.name} removed the supervisor for ${parsed.name}`,
            },
            tx,
          )
        }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(',') ?? ''
        throw new ConflictError(
          target.includes('username')
            ? `The username "${parsed.username}" is already taken.`
            : 'An account with that email address already exists.',
        )
      }
      throw error
    }

    revalidatePath('/select-company')
    return { id: existing.id }
  })
}

export async function toggleUserActiveAction(
  input: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  return runAction('toggleUserActive', async () => {
    const actor = await requireUserOrThrow()
    requirePermission(actor, 'user:manage')
    const parsed = toggleUserSchema.parse(input)

    if (parsed.userId === actor.id && !parsed.isActive) {
      throw new ConflictError('You cannot deactivate your own account.')
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, name: true, role: true },
    })
    if (!target) throw new NotFoundError('That user no longer exists.')

    if (target.role === 'ADMIN' && !parsed.isActive) {
      const otherAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: target.id } },
      })
      if (otherAdmins === 0) {
        throw new ConflictError('This is the last active administrator - keep at least one.')
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { isActive: parsed.isActive } })
      if (!parsed.isActive) {
        await tx.authSession.deleteMany({ where: { userId: target.id } })
      }
      await writeAudit(
        {
          actorId: actor.id,
          companyId: null,
          action: parsed.isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
          entity: 'USER',
          entityId: target.id,
          summary: `${actor.name} ${parsed.isActive ? 'reactivated' : 'deactivated'} ${target.name}`,
        },
        tx,
      )
    })

    return { id: target.id, isActive: parsed.isActive }
  })
}

export async function resetUserPasswordAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction('resetUserPassword', async () => {
    const actor = await requireUserOrThrow()
    requirePermission(actor, 'user:manage')
    const parsed = resetPasswordSchema.parse(input)

    const target = await prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, name: true },
    })
    if (!target) throw new NotFoundError('That user no longer exists.')

    const passwordHash = await hashPassword(parsed.password)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { passwordHash } })
      // Force every existing session for that account to re-authenticate.
      await tx.authSession.deleteMany({ where: { userId: target.id } })
      await writeAudit(
        {
          actorId: actor.id,
          companyId: null,
          action: 'USER_PASSWORD_RESET',
          entity: 'USER',
          entityId: target.id,
          summary: `${actor.name} reset the password for ${target.name}`,
        },
        tx,
      )
    })

    return { id: target.id }
  })
}

/** Admin directory listing used by the user management screen. */
export async function listUsersForAdmin() {
  const actor = await requireUserOrThrow()
  if (actor.role !== 'ADMIN') throw new AuthorizationError()

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      displayCode: true,
      role: true,
      isActive: true,
      avatarColor: true,
      lastLoginAt: true,
      createdAt: true,
      userCompanies: {
        select: {
          isDefault: true,
          company: { select: { id: true, name: true, color: true } },
        },
      },
      supervisorLinks: {
        select: { supervisor: { select: { id: true, name: true } } },
        take: 1,
      },
      _count: { select: { subordinateLinks: true, enquiriesCreated: true } },
    },
  })

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    displayCode: user.displayCode,
    role: user.role,
    isActive: user.isActive,
    avatarColor: user.avatarColor,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    companies: user.userCompanies.map((uc) => ({ ...uc.company, isDefault: uc.isDefault })),
    supervisor: user.supervisorLinks[0]?.supervisor ?? null,
    directReports: user._count.subordinateLinks,
    enquiryCount: user._count.enquiriesCreated,
  }))
}

export type AdminUserRow = Awaited<ReturnType<typeof listUsersForAdmin>>[number]
