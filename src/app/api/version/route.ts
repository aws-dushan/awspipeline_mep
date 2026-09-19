import { NextResponse } from 'next/server'

/**
 * What commit this instance is running.
 *
 *   GET /awsmepplt/api/version -> { "commit": "963471d...", "builtAt": "..." }
 *
 * Deliberately public and deliberately boring. After every deploy somebody
 * asks whether the site is running the change yet, and until this existed the
 * only answers were to log in and look at the screen, or to trust that the
 * deploy did what it said. Neither settles it: a deploy can succeed against a
 * container that never restarted, and a screen can look right because the
 * browser kept the old page.
 *
 * It reveals nothing a repository reader does not already have. The commit is
 * a hash of public code, there is no build machine, path or version of
 * anything else here, and no database is touched - which also means it keeps
 * answering when the database is down, and is therefore a usable liveness
 * check rather than a health check that fails for unrelated reasons.
 *
 * The values are compiled into the image as build arguments, so they describe
 * the code in this container and cannot be edited afterwards.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      commit: process.env.APP_COMMIT ?? 'unknown',
      builtAt: process.env.APP_BUILT_AT ?? 'unknown',
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
