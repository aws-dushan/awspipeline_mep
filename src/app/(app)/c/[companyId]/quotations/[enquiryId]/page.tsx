import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { QuotationEditor } from '@/components/quotation/quotation-editor'
import { requireCompanyPage } from '@/lib/auth/session'
import { getEnquiryById } from '@/lib/database/enquiry-repository'
import { prisma } from '@/lib/database/prisma'
import {
  getQuotationForEnquiry,
  getQuotationSettings,
  getReferenceLocation,
  getSalesDetails,
} from '@/lib/database/quotation-repository'
import { toISODate } from '@/lib/format'
import { canEditEnquiry } from '@/lib/permissions'
import { buildReference, type QuotationFormValues } from '@/lib/quotation/quotation'

export const metadata: Metadata = { title: 'Quotation' }

/**
 * A request's quotation: every version, and the sheet to edit one on.
 *
 * With no quotation yet, the sheet opens as a draft filled from the request -
 * customer, contact, project and the sales owner - and nothing is stored until
 * it is saved, so opening "Create quotation" by mistake leaves no trace.
 */
export default async function QuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; enquiryId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { companyId, enquiryId } = await params
  const { user, company } = await requireCompanyPage(companyId)

  const [enquiry, quotation, settings, location] = await Promise.all([
    getEnquiryById(company.id, enquiryId),
    getQuotationForEnquiry(company.id, enquiryId),
    getQuotationSettings(company.id),
    getReferenceLocation(enquiryId),
  ])
  if (!enquiry || enquiry.isDeleted) notFound()

  const canEdit = canEditEnquiry(user, enquiry)

  // ?v=<revision> picks a version; without it the latest is shown.
  const requested = Number((await searchParams).v)
  const selected =
    quotation?.versions.find((version) => version.revision === requested) ??
    quotation?.versions[0] ??
    null

  let draft: QuotationFormValues | null = null
  if (!quotation) {
    const [sales, customer] = await Promise.all([
      getSalesDetails(enquiry.salesResponsibleId, settings),
      prisma.enquiry.findUnique({
        where: { id: enquiry.id },
        select: { customer: { select: { email: true, contactPerson: true, phone: true } } },
      }),
    ])

    draft = {
      quotationDate: toISODate(new Date()) ?? '',
      validUntil: null,
      ...sales,
      customerName: enquiry.customerName,
      attention: enquiry.contactPerson ?? customer?.customer?.contactPerson ?? '',
      attentionPhone: enquiry.phoneNumber ?? customer?.customer?.phone ?? '',
      customerAddress: '',
      customerEmail: enquiry.email ?? customer?.customer?.email ?? '',
      customerRef: enquiry.projectName ?? '',
      enquiryDate: enquiry.enquiryDate ? toISODate(enquiry.enquiryDate) : null,
      // Starts empty: items are what the quotation is for, so they are added
      // deliberately rather than guessed from the enquiry text.
      items: [],
      discountedPrice: null,
      scopeOfWork: settings.defaultScope,
      vatNote: settings.vatNote,
      terms: settings.defaultTerms,
    }
  }

  return (
    <QuotationEditor
      // A fresh editor per version and per save, so the sheet always starts
      // from what is stored rather than from the previous version's edits.
      key={selected ? `${selected.id}:${selected.updatedAt}` : 'new'}
      company={{ id: company.id, currency: company.currency }}
      enquiry={{
        id: enquiry.id,
        jobNo: enquiry.jobNo,
        customerName: enquiry.customerName,
        projectName: enquiry.projectName,
      }}
      settings={settings}
      quotation={quotation}
      referencePreview={buildReference(location, enquiry.jobNo)}
      selectedVersionId={selected?.id ?? null}
      draft={draft}
      canEdit={canEdit}
    />
  )
}

export const dynamic = 'force-dynamic'
