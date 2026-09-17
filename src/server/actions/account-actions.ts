'use server'

import { writeAudit } from '@/lib/audit'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { requireUserOrThrow } from '@/lib/auth/session'
import { prisma } from '@/lib/database/prisma'
import { changePasswordSchema } from '@/lib/validation/auth'
import { fail, ok, runAction, type ActionResult } from '@/server/actions/action-result'

export type ChangePasswordResult = { otherSessionsEnded: number }

/**
 * Change your own password.
 *
 * The current password is required even though the caller is already signed
 * in: without it, anyone at an unattended unlocked machine could change the
 * password and lock the real owner out.
 *
 * Every *other* session for the account is then revoked, so a password change
 * ejects anyone still holding a token. The caller's own session is kept, so
 * they are not bounced to the login screen mid-task.
 */
export async function changeOwnPasswordAction(
  input: unknown,
): Promise<ActionResult<ChangePasswordResult>> {
  return runAction('changeOwnPassword', async () => {
    const parsed = changePasswordSchema.parse(input)
    const user = await requireUserOrThrow()

    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    })
    if (!account) {
      return fail('Your account could not be found. Please sign in again.', {
        code: 'unauthenticated',
      })
    }

    const valid = await verifyPassword(parsed.currentPassword, account.passwordHash)
    if (!valid) {
      return fail('That is not your current password.', {
        fieldErrors: { currentPassword: 'That is not your current password.' },
        code: 'validation',
      })
    }

    if (await verifyPassword(parsed.newPassword, account.passwordHash)) {
      return fail('Choose a password you have not used before.', {
        fieldErrors: { newPassword: 'This is already your current password.' },
        code: 'validation',
      })
    }

    const passwordHash = await hashPassword(parsed.newPassword)

    const removed = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } })

      const result = await tx.authSession.deleteMany({
        where: { userId: user.id, id: { not: user.sessionId } },
      })

      await writeAudit(
        {
          actorId: user.id,
          companyId: null,
          action: 'USER_PASSWORD_RESET',
          entity: 'USER',
          entityId: user.id,
          summary: `${user.name} changed their own password`,
          metadata: { self: true, otherSessionsEnded: result.count },
        },
        tx,
      )

      return result.count
    })

    return ok({ otherSessionsEnded: removed })
  })
}
