import { NextResponse, type NextRequest } from 'next/server'

import { AuthenticationError, AuthorizationError, requireCompanyAccess } from '@/lib/auth/session'
import { queryPipelinePage } from '@/lib/database/enquiry-repository'
import { parseEnquiryFilters } from '@/lib/filters/enquiry-filters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Pipeline read endpoint backing the live grid.
 *
 * The company id arrives as a query parameter but is never trusted: it is
 * passed through `requireCompanyAccess`, which throws unless the signed-in
 * user is a member. Filters are parsed by the same schema the server
 * components and the exporter use, so all three agree on what a filter means.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const companyId = searchParams.get('companyId')

  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  try {
    const { company } = await requireCompanyAccess(companyId)
    const filters = parseEnquiryFilters(searchParams)
    const page = await queryPipelinePage({ companyId: company.id, filters })

    return NextResponse.json(page, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[api:enquiries]', error)
    return NextResponse.json({ error: 'Unable to load the pipeline.' }, { status: 500 })
  }
}
