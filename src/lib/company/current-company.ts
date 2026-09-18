import 'server-only'

import { cookies } from 'next/headers'

import type { CompanyAccess } from '@/lib/auth/session'
import { LAST_COMPANY_COOKIE } from '@/lib/company/last-company'

/**
 * The company to show on a screen that is not itself company-scoped.
 *
 * Preference order: where the user last was, then their default company, then
 * the first they can reach. Anything remembered that they can no longer reach
 * is ignored rather than trusted - the cookie is a hint from the browser, so
 * it is checked against the list, never used to widen it.
 */
export async function resolveCurrentCompany(
  companies: CompanyAccess[],
): Promise<CompanyAccess | null> {
  if (companies.length === 0) return null

  const store = await cookies()
  const remembered = store.get(LAST_COMPANY_COOKIE)?.value
  const match = remembered ? companies.find((company) => company.id === remembered) : null

  return match ?? companies.find((company) => company.isDefault) ?? companies[0]
}
