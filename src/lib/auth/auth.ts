import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { headers } from 'next/headers'

import { authConfig } from '@/lib/auth/auth.config'
import { fakeVerify, verifyPassword } from '@/lib/auth/password'
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/auth/rate-limit'
import { prisma } from '@/lib/database/prisma'
import { loginSchema } from '@/lib/validation/auth'

/** Auth.js swallows thrown errors unless they extend CredentialsSignin. */
class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

async function requestContext() {
  try {
    const headerList = await headers()
    const forwarded = headerList.get('x-forwarded-for')
    const ipAddress = forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'unknown'
    return { ipAddress, userAgent: headerList.get('user-agent') ?? undefined }
  } catch {
    return { ipAddress: 'unknown', userAgent: undefined }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) throw new LoginError('invalid_credentials')

        // Usernames are stored lower-cased, so sign-in is case-insensitive.
        const username = parsed.data.username
        const { ipAddress, userAgent } = await requestContext()

        const limit = await checkLoginRateLimit(username, ipAddress)
        if (!limit.allowed) throw new LoginError('rate_limited')

        const user = await prisma.user.findUnique({
          where: { username },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            isActive: true,
            displayCode: true,
            avatarColor: true,
          },
        })

        // Always burn a comparable amount of time, whether or not the account
        // exists, so timing does not disclose which accounts are real.
        if (!user) {
          await fakeVerify()
          await recordLoginAttempt(username, ipAddress, false)
          throw new LoginError('invalid_credentials')
        }

        const valid = await verifyPassword(parsed.data.password, user.passwordHash)
        if (!valid) {
          await recordLoginAttempt(username, ipAddress, false)
          throw new LoginError('invalid_credentials')
        }

        if (!user.isActive) {
          await recordLoginAttempt(username, ipAddress, false)
          throw new LoginError('account_disabled')
        }

        // A user with no company assignment cannot do anything useful, and
        // silently landing on an empty shell is a confusing experience.
        const companyCount = await prisma.userCompany.count({
          where: { userId: user.id, company: { isActive: true } },
        })
        if (companyCount === 0 && user.role !== 'ADMIN') {
          await recordLoginAttempt(username, ipAddress, false)
          throw new LoginError('no_company_access')
        }

        const session = await prisma.authSession.create({
          data: {
            userId: user.id,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            ipAddress,
            userAgent,
          },
          select: { id: true },
        })

        await Promise.all([
          recordLoginAttempt(username, ipAddress, true),
          prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          }),
        ])

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionId: session.id,
          displayCode: user.displayCode,
          avatarColor: user.avatarColor,
        }
      },
    }),
  ],
  events: {
    async signOut(message) {
      const sessionId =
        'token' in message ? (message.token?.sessionId as string | undefined) : undefined
      if (sessionId) {
        await prisma.authSession.deleteMany({ where: { id: sessionId } }).catch(() => undefined)
      }
    },
  },
})

/** Maps the provider error codes above onto messages shown on the login form. */
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect username or password. Please try again.',
  rate_limited: 'Too many failed attempts. Please wait 15 minutes and try again.',
  account_disabled: 'This account has been deactivated. Contact your administrator.',
  no_company_access: 'No company has been assigned to your account yet. Contact your administrator.',
  CredentialsSignin: 'Incorrect username or password. Please try again.',
  default: 'Unable to sign in right now. Please try again.',
}
