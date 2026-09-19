import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/auth.config'

const { auth } = NextAuth(authConfig)

/**
 * The deployment prefix, e.g. "/awsmepplt".
 *
 * Middleware sees the *full* request path, prefix included - unlike route
 * handlers and pages, which Next calls with the prefix already stripped. So
 * matching has to be done against a stripped copy, and every redirect has to
 * put the prefix back. Getting this wrong sends the browser to a path outside
 * this app's nginx location, where the shared edge answers 404.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** The request path as the application thinks of it, without the prefix. */
function appPath(pathname: string): string {
  if (!BASE_PATH || !pathname.startsWith(BASE_PATH)) return pathname
  return pathname.slice(BASE_PATH.length) || '/'
}

/** Pages for signed-out visitors, which a signed-in one is sent away from. */
const PUBLIC_PATHS = ['/login']

/**
 * Reachable by anyone, signed in or not, and answered as-is.
 *
 * Kept separate from PUBLIC_PATHS because that list means "for signed-out
 * visitors" and redirects a signed-in one to /select-company. Doing that to
 * `/api/version` would hand a redirect to something asking for JSON.
 *
 * `/api/version` is here because the deploy has to be able to ask what it
 * just installed, and a check that needs credentials is a check that ends up
 * skipped. It returns the commit hash and nothing else.
 */
const OPEN_PATHS = ['/api/version']

/**
 * First line of defence only. Middleware runs on the edge and can see the JWT
 * but not the database, so it does a cheap signed-in/signed-out check and
 * nothing more. Real authorisation - company access, roles, row ownership -
 * happens server-side in `lib/auth/session.ts`.
 */
export default auth((req) => {
  const { search } = req.nextUrl
  const path = appPath(req.nextUrl.pathname)
  const isAuthenticated = Boolean(req.auth?.user)

  // Auth.js owns its own endpoints; standing in front of them would break the
  // sign-in round trip. This is checked here rather than in the matcher below
  // because the matcher sees the prefixed path.
  if (path.startsWith('/api/auth')) return NextResponse.next()

  const redirectTo = (target: string, callbackUrl?: string) => {
    const url = req.nextUrl.clone()
    url.pathname = `${BASE_PATH}${target}`
    url.search = ''
    // Stored without the prefix: the login form hands it to the Next router,
    // which applies the base path itself. Prefixing here would double it.
    if (callbackUrl) url.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(url)
  }

  if (OPEN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  if (isPublic) {
    if (isAuthenticated) return redirectTo('/select-company')
    return NextResponse.next()
  }

  if (!isAuthenticated) {
    // API callers get a status they can act on. Redirecting a `fetch` to the
    // login page would hand the grid a chunk of HTML and a 200.
    if (path.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401 },
      )
    }

    return redirectTo('/login', path === '/' ? undefined : `${path}${search}`)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. The auth endpoints
     * are skipped in the handler instead of here: with a base path the matcher
     * sees the prefixed path, so a literal "api/auth" pattern no longer lines
     * up with the request.
     */
    '/((?!_next/static|_next/image|favicon.ico|brand/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
}
