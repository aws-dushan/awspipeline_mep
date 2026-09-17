import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'

/**
 * Entry point. Sends the user to the login screen, the company picker, or
 * straight into the single company they have access to.
 */
export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (user.companies.length === 1) {
    redirect(`/c/${user.companies[0].id}/pipeline`)
  }
  redirect('/select-company')
}

export const dynamic = 'force-dynamic'
