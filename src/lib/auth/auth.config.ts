import type { Role } from '@prisma/client'
import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe half of the Auth.js configuration.
 *
 * `middleware.ts` runs on the edge runtime where Prisma cannot run, so the
 * providers (which touch the database) live in `auth.ts` instead. Everything
 * here must stay free of Node-only dependencies.
 */
/**
 * `basePath` is deliberately left at its default of `/api/auth`.
 *
 * Next strips the deployment prefix before it reaches the route handler, so
 * the server genuinely sees `/api/auth/...`; telling Auth.js otherwise makes
 * it fail to parse the action and answer 400. Only the browser needs the
 * prefix, and it gets it from `<SessionProvider basePath>`.
 *
 * `AUTH_URL` follows the same rule: its path is where Auth.js takes its base
 * path from, so it ends at /api/auth and never carries the deployment prefix.
 * Its origin, on the other hand, does matter - Next's standalone server builds
 * request.url from the address it binds to (0.0.0.0), and without a real
 * origin Auth.js sends a signed-out browser to http://0.0.0.0:3000.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12 hours
    updateAge: 30 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user)
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string
        token.role = user.role as Role
        token.sessionId = user.sessionId
        token.name = user.name
        token.email = user.email
        token.displayCode = user.displayCode ?? null
        token.avatarColor = user.avatarColor ?? '#1E4FD8'
      }
      if (trigger === 'update' && session?.name) {
        token.name = session.name as string
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.sessionId = token.sessionId as string
        session.user.displayCode = (token.displayCode as string | null) ?? null
        session.user.avatarColor = (token.avatarColor as string) ?? '#1E4FD8'
      }
      return session
    },
  },
} satisfies NextAuthConfig
