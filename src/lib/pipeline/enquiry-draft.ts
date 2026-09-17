import type { PipelineRow } from '@/lib/database/enquiry-repository'
import { toISODate } from '@/lib/format'
import type { EnquiryFormInput } from '@/lib/validation/enquiry'

/**
 * A saved request as the edit form sees it.
 *
 * Both editors work from this - the drawer and the grid's inline row - so a
 * field can never be mapped one way in one of them and another way in the
 * other. Everything is a string because that is what the controls hand back;
 * the schema is what turns it into values worth storing.
 */
export function enquiryToFormValues(record: PipelineRow): EnquiryFormInput {
  return {
    salesResponsibleId: record.salesResponsible?.id ?? '',
    // Left empty on purpose: the customer is identified by name until the
    // picker is used, and sending a stale id would repoint the request at
    // whichever customer happened to be selected when it was first written.
    customerId: '',
    customerName: record.customerName,
    projectName: record.projectName ?? '',
    statusValueId: record.status?.id ?? '',
    locationValueId: record.location?.id ?? '',
    materialValueId: record.material?.id ?? '',
    enquiryDetails: record.enquiryDetails ?? '',
    quoteValue: record.quoteValue === null ? '' : String(record.quoteValue),
    probabilityValueId: record.probability?.id ?? '',
    expectedOrderDate: toISODate(record.expectedOrderDate) ?? '',
    expectedBillingDate: toISODate(record.expectedBillingDate) ?? '',
    email: record.email ?? '',
    phoneNumber: record.phoneNumber ?? '',
    remarks: record.remarks ?? '',
  }
}
