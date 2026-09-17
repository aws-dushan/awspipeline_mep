import { prisma } from '@/lib/database/prisma'

const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 8)
const WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

/**
 * Login throttling backed by the `login_attempts` table.
 *
 * The limit is applied per email *and* per IP, so neither credential stuffing
 * against one account nor spraying many accounts from one host gets a free
 * pass. Successful logins clear the counter for that identifier.
 */
export async function checkLoginRateLimit(
  identifier: string,
  ipAddress: string,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS)

  const [byIdentifier, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { identifier: identifier.toLowerCase(), successful: false, createdAt: { gte: since } },
    }),
    prisma.loginAttempt.count({
      where: { ipAddress, successful: false, createdAt: { gte: since } },
    }),
  ])

  // The IP budget is deliberately wider - offices share one public address.
  const identifierExceeded = byIdentifier >= MAX_ATTEMPTS
  const ipExceeded = byIp >= MAX_ATTEMPTS * 5

  return {
    allowed: !identifierExceeded && !ipExceeded,
    remaining: Math.max(0, MAX_ATTEMPTS - byIdentifier),
    retryAfterMs: WINDOW_MS,
  }
}

export async function recordLoginAttempt(
  identifier: string,
  ipAddress: string,
  successful: boolean,
): Promise<void> {
  const normalized = identifier.toLowerCase()

  await prisma.loginAttempt.create({
    data: { identifier: normalized, ipAddress, successful },
  })

  if (successful) {
    await prisma.loginAttempt.deleteMany({
      where: { identifier: normalized, successful: false },
    })
  }
}

/** Housekeeping: drop attempt rows older than a day. */
export async function pruneLoginAttempts(): Promise<void> {
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
}
