import { NextResponse, type NextRequest } from 'next/server'

import { AuthenticationError, AuthorizationError, requireCompanyAccess } from '@/lib/auth/session'
import { listCustomers } from '@/lib/database/customer-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Customer book for the picker. Scoped to the caller's company membership. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const companyId = searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  try {
    const { company } = await requireCompanyAccess(companyId)
    const customers = await listCustomers(company.id, {
      search: searchParams.get('q') ?? undefined,
    })
    return NextResponse.json(customers, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[api:customers]', error)
    return NextResponse.json({ error: 'Unable to load customers.' }, { status: 500 })
  }
}
