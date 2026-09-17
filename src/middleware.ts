import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/auth.config'

const { auth } = NextAuth(authConfig)

const PUBLIC_PATHS = ['/login']

/**
 * First line of defence only. Middleware runs on the edge and can see the JWT
 * but not the database, so it does a cheap signed-in/signed-out check and
 * nothing more. Real authorisation - company access, roles, row ownership -
 * happens server-side in `lib/auth/session.ts`.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl
  const isAuthenticated = Boolean(req.auth?.user)
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  if (isPublic) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/select-company', req.nextUrl))
    }
    return NextResponse.next()
  }

  if (!isAuthenticated) {
    // API callers get a status they can act on. Redirecting a `fetch` to the
    // login page would hand the grid a chunk of HTML and a 200.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401 },
      )
    }

    const loginUrl = new URL('/login', req.nextUrl)
    if (pathname !== '/') {
      loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
    }
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the auth API routes and static assets.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
}
