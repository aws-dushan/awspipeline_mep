import { NextResponse, type NextRequest } from 'next/server'

import { writeAudit } from '@/lib/audit'
import {
  AuthenticationError,
  AuthorizationError,
  requireCompanyPermission,
} from '@/lib/auth/session'
import {
  getQuotationSettings,
  getVersionForDocument,
} from '@/lib/database/quotation-repository'
import { renderQuotationPdf } from '@/lib/quotation/pdf'
import { quotationFilename, revisionLabel } from '@/lib/quotation/quotation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One version of a quotation as a PDF.
 *
 * `?download=1` sends it as an attachment and records the download in the
 * request's history; without it the browser opens it in a tab to read.
 * Any version can be fetched at any time - R0 still prints exactly as it was
 * issued after R1 exists.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params
  const { searchParams } = request.nextUrl
  const companyId = searchParams.get('companyId')
  const download = searchParams.get('download') === '1'

  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  try {
    const { user, company } = await requireCompanyPermission(companyId, 'pipeline:view')

    const [found, settings] = await Promise.all([
      getVersionForDocument(company.id, versionId),
      getQuotationSettings(company.id),
    ])
    if (!found || found.enquiry.isDeleted) {
      return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 })
    }

    const { version, referenceNo, quotationId, enquiry } = found
    const buffer = await renderQuotationPdf({
      referenceNo,
      revision: version.revision,
      currency: version.currency,
      values: version.values,
      settings,
    })
    const filename = quotationFilename(enquiry.jobNo, version.values.customerName, version.revision)

    if (download) {
      await writeAudit({
        actorId: user.id,
        companyId: company.id,
        action: 'QUOTATION_DOWNLOADED',
        entity: 'QUOTATION',
        entityId: quotationId,
        enquiryId: enquiry.id,
        summary: `${user.name} downloaded quotation ${referenceNo} ${revisionLabel(version.revision)}`,
        metadata: { referenceNo, revision: version.revision, filename },
      })
    }

    // RFC 5987: the plain name for old clients, the UTF-8 one for the rest -
    // customer names carry "&" and non-ASCII characters.
    const asciiName = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
    const disposition = `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 })
    }
    console.error('[api:quotation-pdf]', error)
    return NextResponse.json({ error: 'Unable to build the quotation.' }, { status: 500 })
  }
}
