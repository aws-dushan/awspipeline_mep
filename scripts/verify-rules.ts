/**
 * Business-rule verification.
 *
 * Exercises the guarantees that matter most and are easiest to regress:
 * company isolation, soft-delete exclusion, newest-first ordering, combined
 * filters, export/grid parity, and the automation engine.
 *
 * Creates its own throwaway companies and deletes them at the end, so it can
 * be run repeatedly against a live database without leaving residue.
 *
 *   npx tsx scripts/verify-rules.ts
 */

import { PrismaClient, type DropdownTypeKey } from '@prisma/client'

import { buildDefaultDropdownRows } from '../src/lib/database/dropdown-defaults'
import {
  buildEnquiryOrderBy,
  buildEnquiryWhere,
  enquiryFilterSchema,
  parseEnquiryFilters,
  serializeEnquiryFilters,
  countActiveFilters,
} from '../src/lib/filters/enquiry-filters'
import { applyAutomationRules, DEFAULT_RULE_PAIRS } from '../src/lib/pipeline/automation'
import { PIPELINE_COLUMNS } from '../src/lib/pipeline/columns'
import {
  createUserSchema,
  updateUserFormSchema,
  updateUserSchema,
} from '../src/lib/validation/admin'
import { formatJobNo } from '../src/lib/pipeline/job-number'

const prisma = new PrismaClient()

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
  console.log('-'.repeat(title.length))
}

async function main() {
  const suffix = Date.now().toString(36).toUpperCase().slice(-5)

  const types = await prisma.dropdownType.findMany({ select: { id: true, key: true } })
  const typeIds = Object.fromEntries(types.map((t) => [t.key, t.id])) as Record<
    DropdownTypeKey,
    string
  >

  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })

  async function makeCompany(name: string) {
    const company = await prisma.company.create({
      data: {
        name,
        counter: { create: { nextSerialNo: 1, nextJobNo: 1000 } },
      },
      select: { id: true },
    })
    await prisma.dropdownValue.createMany({ data: buildDefaultDropdownRows(company.id, typeIds) })

    /*
     * Location and Material ship empty - they differ by company and by trade,
     * so an administrator adds their own. The checks below still need some,
     * so this creates the ones they refer to rather than assuming a default
     * catalogue that deliberately does not exist.
     */
    await prisma.dropdownValue.createMany({
      data: [
        { typeKey: 'LOCATION' as const, label: 'DXB', sortOrder: 0 },
        { typeKey: 'LOCATION' as const, label: 'SHJ', sortOrder: 1 },
        { typeKey: 'MATERIAL' as const, label: 'AC', sortOrder: 0 },
      ].map((value) => ({
        companyId: company.id,
        typeId: typeIds[value.typeKey],
        typeKey: value.typeKey,
        label: value.label,
        color: null,
        sortOrder: value.sortOrder,
        isActive: true,
        isDefault: false,
        numericValue: null,
      })),
    })

    return company.id
  }

  const companyA = await makeCompany(`Test Company A ${suffix}`)
  const companyB = await makeCompany(`Test Company B ${suffix}`)

  try {

    const valuesA = await prisma.dropdownValue.findMany({
      where: { companyId: companyA },
      select: { id: true, typeKey: true, label: true, numericValue: true },
    })
    const find = (type: DropdownTypeKey, label: string) =>
      valuesA.find((v) => v.typeKey === type && v.label === label)!

    const statusWon = find('STATUS', 'Won')
    const statusQuoted = find('STATUS', 'Quoted')
    const statusLost = find('STATUS', 'Lost')
    const locDxb = find('LOCATION', 'DXB')
    const locShj = find('LOCATION', 'SHJ')
    const matAc = find('MATERIAL', 'AC')
    const prob100 = find('PROBABILITY', '100%')
    const prob50 = find('PROBABILITY', '50%')
    const prob0 = find('PROBABILITY', '0%')

    // --- Seed enquiries in a known order ------------------------------------
    const base = Date.now() - 10 * 60_000
    const rows = [
      { jobNo: '1001', serialNo: 1, customer: 'Alpha Contracting', status: statusQuoted.id, loc: locDxb.id, prob: prob50.id, quote: 10_000, offset: 0 },
      { jobNo: '1002', serialNo: 2, customer: 'Beta Interiors', status: statusWon.id, loc: locDxb.id, prob: prob100.id, quote: 25_000, offset: 60_000 },
      { jobNo: '1003', serialNo: 3, customer: 'Gamma Trading', status: statusLost.id, loc: locShj.id, prob: prob0.id, quote: 5_000, offset: 120_000 },
      { jobNo: '1004', serialNo: 4, customer: 'Delta Works', status: statusQuoted.id, loc: locShj.id, prob: prob50.id, quote: 40_000, offset: 180_000 },
    ]

    for (const row of rows) {
      await prisma.enquiry.create({
        data: {
          companyId: companyA,
          serialNo: row.serialNo,
          jobNo: row.jobNo,
          enquiryDate: new Date(Date.UTC(2026, 8, 10 + row.serialNo)),
          customerName: row.customer,
          statusValueId: row.status,
          locationValueId: row.loc,
          materialValueId: matAc.id,
          probabilityValueId: row.prob,
          quoteValue: row.quote,
          createdById: owner?.id ?? null,
          createdAt: new Date(base + row.offset),
        },
      })
    }

    // One record in company B, to prove isolation.
    const valuesB = await prisma.dropdownValue.findMany({
      where: { companyId: companyB, typeKey: 'STATUS', label: 'Won' },
      select: { id: true },
    })
    await prisma.enquiry.create({
      data: {
        companyId: companyB,
        serialNo: 1,
        jobNo: '1001',
        enquiryDate: new Date(Date.UTC(2026, 8, 12)),
        customerName: 'Company B Confidential Client',
        statusValueId: valuesB[0]?.id ?? null,
        quoteValue: 999_999,
        createdAt: new Date(base + 30_000),
      },
    })

    const noFilters = enquiryFilterSchema.parse({})

    // ==========================================================================
    section('1. Company isolation')
    // ==========================================================================
    const aRows = await prisma.enquiry.findMany({
      where: buildEnquiryWhere({ companyId: companyA, filters: noFilters }),
      select: { customerName: true, companyId: true },
    })
    check('Company A query returns only company A rows', aRows.every((r) => r.companyId === companyA))
    check(
      "Company B's record is not visible from company A",
      !aRows.some((r) => r.customerName.includes('Confidential')),
    )
    check('Company A sees exactly its 4 rows', aRows.length === 4, `got ${aRows.length}`)

    // A crafted filter cannot widen the scope: companyId is applied by the
    // builder itself, not taken from the filter payload.
    const crafted = buildEnquiryWhere({
      companyId: companyA,
      filters: parseEnquiryFilters({ companyId: companyB, q: 'Confidential' } as never),
    })
    const craftedRows = await prisma.enquiry.findMany({ where: crafted, select: { id: true } })
    check('A crafted companyId in the query string cannot cross the tenant boundary', craftedRows.length === 0)

    // ==========================================================================
    section('2. Newest first, ordered by S.No')
    // ==========================================================================
    const ordered = await prisma.enquiry.findMany({
      where: buildEnquiryWhere({ companyId: companyA, filters: noFilters }),
      orderBy: buildEnquiryOrderBy(noFilters),
      select: { jobNo: true, serialNo: true },
    })
    check(
      'Default order is highest S.No first',
      ordered[0]?.serialNo === 4 && ordered[3]?.serialNo === 1,
      `got ${ordered.map((r) => r.serialNo).join(', ')}`,
    )
    check(
      'Newest request is on top',
      ordered[0]?.jobNo === '1004',
      `got ${ordered.map((r) => r.jobNo).join(', ')}`,
    )

    // The per-company counter only moves forward, so a new row always takes the
    // highest S.No - the order cannot be disturbed by an edited timestamp.
    await prisma.enquiry.updateMany({
      where: { companyId: companyA, jobNo: '1004' },
      data: { createdAt: new Date(base - 600_000) },
    })
    const reordered = await prisma.enquiry.findMany({
      where: buildEnquiryWhere({ companyId: companyA, filters: noFilters }),
      orderBy: buildEnquiryOrderBy(noFilters),
      select: { jobNo: true },
    })
    check(
      'Order follows S.No, not createdAt',
      reordered[0]?.jobNo === '1004',
      `got ${reordered.map((r) => r.jobNo).join(', ')}`,
    )
    await prisma.enquiry.updateMany({
      where: { companyId: companyA, jobNo: '1004' },
      data: { createdAt: new Date(base + 180_000) },
    })

    // ==========================================================================
    section('3. Filters, individually and combined')
    // ==========================================================================
    async function countWith(filterInput: Record<string, unknown>) {
      const filters = enquiryFilterSchema.parse(filterInput)
      return prisma.enquiry.count({ where: buildEnquiryWhere({ companyId: companyA, filters }) })
    }

    check('Status filter', (await countWith({ status: statusQuoted.id })) === 2)
    check('Location filter', (await countWith({ location: locShj.id })) === 2)
    check('Probability filter', (await countWith({ probability: prob100.id })) === 1)
    check('Customer contains, case-insensitive', (await countWith({ customerName: 'beta' })) === 1)
    check('Quote value minimum', (await countWith({ quoteValueMin: 20_000 })) === 2)
    check('Quote value range', (await countWith({ quoteValueMin: 6_000, quoteValueMax: 26_000 })) === 2)
    check('Date range is inclusive of the end day', (await countWith({ enquiryDateFrom: '2026-09-11', enquiryDateTo: '2026-09-12' })) === 2)
    check('Global search across text columns', (await countWith({ q: 'gamma' })) === 1)
    check(
      'Multiple filters combine (AND, not OR)',
      (await countWith({ status: statusQuoted.id, location: locShj.id })) === 1,
    )
    check(
      'Filters that cannot overlap return nothing',
      (await countWith({ status: statusWon.id, location: locShj.id })) === 0,
    )
    check(
      'Multi-select within one column is an OR',
      (await countWith({ status: [statusQuoted.id, statusWon.id].join(',') })) === 3,
    )

    // ==========================================================================
    section('4. Soft delete')
    // ==========================================================================
    await prisma.enquiry.updateMany({
      where: { companyId: companyA, jobNo: '1003' },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deleteReason: 'Verification: duplicate enquiry',
      },
    })

    const afterDelete = await prisma.enquiry.count({
      where: buildEnquiryWhere({ companyId: companyA, filters: noFilters }),
    })
    check('Deleted record disappears from the pipeline', afterDelete === 3, `got ${afterDelete}`)

    const stillInDb = await prisma.enquiry.findFirst({
      where: { companyId: companyA, jobNo: '1003' },
      select: { isDeleted: true, deleteReason: true },
    })
    check('Deleted record is still physically in PostgreSQL', stillInDb !== null)
    check('Deletion reason is retained', Boolean(stillInDb?.deleteReason))

    const deletedSearch = await prisma.enquiry.count({
      where: buildEnquiryWhere({ companyId: companyA, filters: enquiryFilterSchema.parse({ q: 'Gamma' }) }),
    })
    check('Deleted record is excluded from search', deletedSearch === 0)

    const deletedFiltered = await prisma.enquiry.count({
      where: buildEnquiryWhere({
        companyId: companyA,
        filters: enquiryFilterSchema.parse({ location: locShj.id }),
      }),
    })
    check('Deleted record is excluded from filtered results', deletedFiltered === 1)

    const adminView = await prisma.enquiry.count({
      where: buildEnquiryWhere({ companyId: companyA, filters: noFilters, deletedOnly: true }),
    })
    check('Admin deleted-records view can still reach it', adminView === 1)

    // ==========================================================================
    section('5. Export uses the same query as the grid')
    // ==========================================================================
    const exportFilters = enquiryFilterSchema.parse({ status: statusQuoted.id, location: locDxb.id })
    const gridWhere = buildEnquiryWhere({ companyId: companyA, filters: exportFilters })
    // The export route only overrides paging, never the predicate.
    const exportWhere = buildEnquiryWhere({
      companyId: companyA,
      filters: { ...exportFilters, page: 1, pageSize: 200 },
    })
    check(
      'Export predicate is identical to the grid predicate',
      JSON.stringify(gridWhere) === JSON.stringify(exportWhere),
    )

    const exportRows = await prisma.enquiry.count({ where: exportWhere })
    const gridRows = await prisma.enquiry.count({ where: gridWhere })
    check('Export row count matches the filtered grid', exportRows === gridRows && exportRows === 1)

    check('Export carries every pipeline column', PIPELINE_COLUMNS.length === 16)
    check(
      'Export headers are in the agreed order',
      PIPELINE_COLUMNS.map((c) => c.exportLabel).join('|') ===
        [
          'JOB NO', 'Enquiry Date', 'Sales Responsible', 'Customer Name',
          'Project Name', 'Status', 'Location', 'Material', 'Enquiry Details',
          'Quote Value', 'Probability', 'Exp Order Date', 'Exp Billing Date',
          'Email', 'Phone Number', 'Remarks',
        ].join('|'),
    )
    check(
      'The export has no S.No column',
      !PIPELINE_COLUMNS.some((column) => /^s\.?\s*no$/i.test(column.exportLabel)),
    )

    // ==========================================================================
    section('6. Automation rules')
    // ==========================================================================
    const rules = DEFAULT_RULE_PAIRS.map((pair, index) => ({
      id: `rule-${index}`,
      whenType: pair.whenType,
      whenValueId: find(pair.whenType, pair.whenLabel).id,
      thenType: pair.thenType,
      thenValueId: find(pair.thenType, pair.thenLabel).id,
      isActive: true,
      whenLabel: pair.whenLabel,
      thenLabel: pair.thenLabel,
    }))

    const fromProbability = applyAutomationRules(
      { STATUS: statusQuoted.id, PROBABILITY: prob100.id },
      rules,
      'PROBABILITY',
    )
    check(
      'Probability 100% sets Status to Won',
      fromProbability.selection.STATUS === statusWon.id,
    )

    const fromStatus = applyAutomationRules(
      { STATUS: statusWon.id, PROBABILITY: prob50.id },
      rules,
      'STATUS',
    )
    check('Status Won sets Probability to 100%', fromStatus.selection.PROBABILITY === prob100.id)

    const fromLost = applyAutomationRules(
      { STATUS: statusLost.id, PROBABILITY: prob50.id },
      rules,
      'STATUS',
    )
    check('Status Lost sets Probability to 0%', fromLost.selection.PROBABILITY === prob0.id)

    const untouched = applyAutomationRules(
      { STATUS: statusQuoted.id, PROBABILITY: prob50.id },
      rules,
      'LOCATION',
    )
    check(
      'Editing an unrelated field does not rewrite anything',
      untouched.applied.length === 0 &&
        untouched.selection.STATUS === statusQuoted.id &&
        untouched.selection.PROBABILITY === prob50.id,
    )

    const disabled = applyAutomationRules(
      { STATUS: statusQuoted.id, PROBABILITY: prob100.id },
      rules.map((rule) => ({ ...rule, isActive: false })),
      'PROBABILITY',
    )
    check('Disabled rules do nothing', disabled.selection.STATUS === statusQuoted.id)

    // A pair of rules that point back at each other must terminate.
    const mutual = applyAutomationRules(
      { STATUS: statusQuoted.id, PROBABILITY: prob100.id },
      rules,
      'PROBABILITY',
    )
    check(
      'Mirrored rules settle instead of looping',
      mutual.applied.length === 1 && mutual.selection.PROBABILITY === prob100.id,
    )

    // ==========================================================================
    section('7. Filter serialisation round-trip')
    // ==========================================================================
    const original = enquiryFilterSchema.parse({
      status: [statusWon.id, statusQuoted.id].join(','),
      customerName: 'Alpha',
      quoteValueMin: 1000,
      enquiryDateFrom: '2026-09-01',
    })
    const roundTripped = parseEnquiryFilters(serializeEnquiryFilters(original))
    check(
      'Filters survive a URL round-trip',
      JSON.stringify(buildEnquiryWhere({ companyId: companyA, filters: original })) ===
        JSON.stringify(buildEnquiryWhere({ companyId: companyA, filters: roundTripped })),
    )
    check('Active filter count is accurate', countActiveFilters(original) === 4)
    check('An empty filter set counts as zero', countActiveFilters(noFilters) === 0)
    check(
      'A malformed query string falls back to no filters rather than failing',
      countActiveFilters(parseEnquiryFilters({ enquiryDateFrom: 'not-a-date' })) === 0,
    )

    // ==========================================================================
    section('8. Numbering')
    // ==========================================================================
    const counter = await prisma.$transaction(async (tx) => {
      const first = await tx.companyCounter.update({
        where: { companyId: companyA },
        data: { nextSerialNo: { increment: 1 }, nextJobNo: { increment: 1 } },
        select: { nextSerialNo: true, nextJobNo: true },
      })
      const second = await tx.companyCounter.update({
        where: { companyId: companyA },
        data: { nextSerialNo: { increment: 1 }, nextJobNo: { increment: 1 } },
        select: { nextSerialNo: true, nextJobNo: true },
      })
      return { first, second }
    })
    check(
      'Sequential allocations never hand out the same number',
      counter.second.nextJobNo === counter.first.nextJobNo + 1,
    )

    const duplicate = await prisma.enquiry
      .create({
        data: {
          companyId: companyA,
          serialNo: 1,
          jobNo: '1001',
          enquiryDate: new Date(),
          customerName: 'Duplicate attempt',
        },
      })
      .then(() => false)
      .catch(() => true)
    check('A duplicate Job No within a company is rejected by the database', duplicate)

    const sameJobOtherCompany = await prisma.enquiry
      .findFirst({ where: { companyId: companyB, jobNo: '1001' }, select: { id: true } })
      .then((row) => row !== null)
    check('The same Job No may exist in a different company', sameJobOtherCompany)

    // ==========================================================================
    section('9. Form schemas match their forms')
    // ==========================================================================
    /*
     * A form must validate the fields it actually holds.
     *
     * The edit-user dialog was validating against the server's update schema,
     * which also requires the user's id - supplied by the screen, bound to no
     * control. Every save failed on it, and with nothing rendering that field
     * the error had nowhere to appear, so the dialog sat there doing nothing.
     * Cheap to check, and invisible from the outside until someone saves.
     */
    const userFormValues = {
      name: 'Check Person',
      username: 'check.p',
      email: 'check@example.com',
      role: 'USER' as const,
      isActive: true,
      companyIds: ['c1'],
      defaultCompanyId: 'c1',
      supervisorId: '',
    }
    check(
      'The edit-user form validates the fields it holds',
      updateUserFormSchema.safeParse(userFormValues).success,
    )
    check(
      'The server still demands to be told which user',
      !updateUserSchema.safeParse(userFormValues).success &&
        updateUserSchema.safeParse({ ...userFormValues, userId: 'u1' }).success,
    )
    check(
      'The create form is unaffected',
      createUserSchema.safeParse({ ...userFormValues, password: 'Test123456' }).success,
    )
    check(
      'Cross-field rules survive on the form schema',
      !updateUserFormSchema.safeParse({ ...userFormValues, companyIds: [], defaultCompanyId: '' })
        .success &&
        updateUserFormSchema.safeParse({
          ...userFormValues,
          role: 'ADMIN' as const,
          companyIds: [],
          defaultCompanyId: '',
        }).success,
    )

    // ==========================================================================
    section('10. Job numbers')
  // ==========================================================================
  check("Prefix and country code compose as J1000_DXB", formatJobNo('J', 1000, 'DXB') === 'J1000_DXB')
  check('A company with neither gets a bare number', formatJobNo('', 1000, '') === '1000')
  check('A prefix alone leaves no trailing separator', formatJobNo('J', 1000, '') === 'J1000')
  check('A country code alone still gets its separator', formatJobNo('', 1000, 'DXB') === '1000_DXB')
  check('Stray whitespace never reaches a job number', formatJobNo(' J ', 1000, ' DXB ') === 'J1000_DXB')

  // ==========================================================================
  section('11. Mandatory fields')
    // ==========================================================================
    /*
     * Ten fields are mandatory - S.No, Job No, Sales Responsible, Customer Name,
     * Project Name, Status, Location, Material, Enquiry Details and Probability.
     * Everything else may be left blank, and the enquiry date is the one that
     * had to change in the database to allow it. The form is checked in the
     * browser by scripts/ui-check.mjs; this checks the column underneath, so a
     * blank date fails validation rather than the insert.
     */
    const withoutDate = await prisma.enquiry
      .create({
        data: {
          companyId: companyA,
          serialNo: 900,
          jobNo: '9900',
          enquiryDate: null,
          customerName: 'No Date Trading',
          projectName: 'Undated project',
          statusValueId: statusQuoted.id,
          locationValueId: locDxb.id,
          materialValueId: matAc.id,
          probabilityValueId: prob50.id,
          enquiryDetails: 'Logged before the enquiry date was known',
        },
        select: { id: true, enquiryDate: true },
      })
      .catch(() => null)
    check('A request can be saved without an enquiry date', withoutDate?.enquiryDate === null)

    const optionalsStayNull = withoutDate
      ? await prisma.enquiry.findUnique({
          where: { id: withoutDate.id },
          select: { quoteValue: true, expectedOrderDate: true, email: true, remarks: true },
        })
      : null
    check(
      'The other optional fields are left null rather than defaulted',
      Boolean(
        optionalsStayNull &&
          optionalsStayNull.quoteValue === null &&
          optionalsStayNull.expectedOrderDate === null &&
          optionalsStayNull.email === null &&
          optionalsStayNull.remarks === null,
      ),
    )

  } finally {
    /*
     * Always, including when a check throws part way through.
     * This runs against a live database, and a failed run that leaves
     * its throwaway companies behind puts them on the company chooser
     * for every user until someone notices.
     */
    await prisma.enquiry.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await prisma.automationRule.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await prisma.dropdownValue.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } })
  }


  console.log(`\n${'='.repeat(46)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('='.repeat(46))

  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
