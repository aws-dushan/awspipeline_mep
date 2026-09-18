import { BASE_PATH } from '@/lib/base-path'

/**
 * Which company the user was last working in.
 *
 * The global admin screens - companies and users - sit outside
 * `/c/[companyId]`, because an administrator needs them before any company
 * exists. The shell above them still needs a company for its switcher and for
 * every link in the top bar, and it used to take the first one in the list.
 * That list is alphabetical, so working in "UAE" and opening Users showed
 * "Oman" - and pointed the Pipeline link at Oman too.
 *
 * So the company-scoped screens record where you are and the admin screens
 * read it back. It is a breadcrumb, not a permission: whatever it names is
 * still checked against the companies the user may actually reach.
 *
 * The name and path live here, apart from the reader, because the browser
 * writes the cookie and the server reads it - and `next/headers` cannot be
 * imported into a client component.
 */
export const LAST_COMPANY_COOKIE = 'pipeline.company'

/** Path-scoped to this deployment, so two apps on one host do not share it. */
export const LAST_COMPANY_COOKIE_PATH = BASE_PATH || '/'

/** Thirty days: long enough to survive a weekend, short enough to expire. */
export const LAST_COMPANY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
