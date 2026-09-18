/**
 * Import requests from the spreadsheet the pipeline used to live in.
 *
 *   node scripts/import-pipeline.mjs <file.xlsm> --company "UAE" [--apply]
 *
 * Without `--apply` it reads, cleans, reports and writes nothing. Run it that
 * way first: the report is the review.
 *
 * Job numbers keep the number the spreadsheet gave them and take their shape
 * from the company's own prefix and suffix, so an imported request is written
 * the same way as one raised in the system. The counter then moves past the
 * highest imported number and the series continues from there.
 *
 * Nothing is invented. A blank cell stays blank, even where the form would
 * insist on a value when someone next edits that request - a historical row
 * with no probability recorded should not acquire one here.
 */
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const apply = args.includes('--apply')
const companyName = args[args.indexOf('--company') + 1]
if (!file || !companyName) {
  console.error('usage: node scripts/import-pipeline.mjs <file> --company "<name>" [--apply]')
  process.exit(1)
}

/** Job numbers read <prefix><number>_<suffix>, e.g. J1110_DXB. */
function formatJobNo(prefix, serial, suffix) {
  const tail = suffix.trim() ? `_${suffix.trim()}` : ''
  return `${prefix.trim()}${serial}${tail}`
}

const cell = (v) => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object' && v.text !== undefined) return String(v.text)
  if (typeof v === 'object' && v.result !== undefined) return String(v.result)
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('')
  return String(v)
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]

let header = null
const rows = []
ws.eachRow({ includeEmpty: false }, (row, n) => {
  const values = row.values.slice(1).map(cell)
  if (n === 1) {
    header = values
    return
  }
  if (values.every((v) => !v.trim())) return
  rows.push(Object.fromEntries(header.map((h, i) => [h.trim(), (values[i] ?? '').trim()])))
})

/**
 * Pull a person's name out of a phone cell.
 *
 * The spreadsheet's phone column carries a name in most rows, written every
 * way a person might: "Mr.Asif +971 52 191 2226", "52 891 9640 - felix",
 * "Mohamed Nizar-523312040|", a tab instead of a space. Rather than pattern
 * every variant, this finds the number - the longest run of digits and phone
 * punctuation holding at least seven digits - and treats what is left as the
 * name.
 */
function splitContact(raw) {
  const text = (raw ?? '').replace(/[\t\u00a0]+/g, ' ').trim()
  if (!text) return { name: '', phone: '' }

  const candidates = [...text.matchAll(/\+?\d[\d\s()\-.]{4,}/g)]
    .map((m) => m[0])
    .filter((m) => (m.match(/\d/g) ?? []).length >= 7)

  if (candidates.length === 0) return { name: tidyName(text), phone: '' }

  const phone = candidates.sort(
    (a, b) => (b.match(/\d/g) ?? []).length - (a.match(/\d/g) ?? []).length,
  )[0]
  return { name: tidyName(text.replace(phone, ' ')), phone: tidyPhone(phone) }
}

function tidyName(value) {
  return value
    .replace(/[|,;]+/g, ' ')
    .replace(/(^|\s)[-.]+(\s|$)/g, ' ')
    .replace(/^[-\s.]+|[-\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tidyPhone(value) {
  return value
    .replace(/[^\d+\s()-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s-]+$/g, '')
    .trim()
}

/** "AED 3,204.00" -> 3204. Blank stays blank. */
function parseMoney(value) {
  if (!value) return null
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** A spreadsheet fraction (0.25) as the label the system uses ("25%"). */
function probabilityLabel(value) {
  if (!value) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
  return `${pct}%`
}

function parseDate(value) {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

const splitList = (value) =>
  (value ?? '')
    .split(/[,/;]+/)
    .map((part) => part.trim())
    .filter(Boolean)

const company = await prisma.company.findUnique({
  where: { name: companyName },
  select: {
    id: true,
    counter: {
      select: { nextSerialNo: true, nextJobNo: true, jobNoPrefix: true, jobNoSuffix: true },
    },
  },
})
if (!company) throw new Error(`No company named "${companyName}"`)

const users = await prisma.user.findMany({ select: { id: true, name: true } })
const values = await prisma.dropdownValue.findMany({
  where: { companyId: company.id },
  select: { id: true, typeKey: true, label: true },
})

const findValue = (typeKey, label) =>
  values.find(
    (v) => v.typeKey === typeKey && v.label.toLowerCase() === String(label).trim().toLowerCase(),
  ) ?? null

/** Matched on the first name, which is how the spreadsheet refers to people. */
function findUser(label) {
  if (!label) return null
  const wanted = label.trim().toLowerCase()
  return (
    users.find((u) => u.name.toLowerCase() === wanted) ??
    users.find((u) => u.name.toLowerCase().split(' ')[0] === wanted) ??
    // Last resort: the closest first name by its opening letters, which is how
    // "ATHIYA" reaches "Athila". Reported, never silent.
    users.find((u) => u.name.toLowerCase().split(' ')[0].slice(0, 4) === wanted.slice(0, 4)) ??
    null
  )
}

const prepared = []
const problems = []
const fuzzyUsers = new Map()
const missingValues = new Set()

for (const [index, r] of rows.entries()) {
  const line = index + 2
  const jobNumber = Number((r['JOB NO'] ?? '').trim())
  if (!Number.isFinite(jobNumber)) {
    problems.push(`row ${line}: job number "${r['JOB NO']}" is not a number - skipped`)
    continue
  }

  const fromPhone = splitContact(r['Phone number'])
  const contactPerson = (r['Contact'] ?? '').trim() || fromPhone.name

  const statusLabel = (r['Status'] ?? '').trim()
  const status = statusLabel ? findValue('STATUS', statusLabel) : null
  if (statusLabel && !status) missingValues.add(`STATUS: ${statusLabel}`)

  const probLabel = probabilityLabel(r['Probability'])
  const probability = probLabel ? findValue('PROBABILITY', probLabel) : null
  if (probLabel && !probability) missingValues.add(`PROBABILITY: ${probLabel}`)

  const locationIds = []
  for (const label of splitList(r['Location'])) {
    const v = findValue('LOCATION', label)
    if (v) locationIds.push(v.id)
    else missingValues.add(`LOCATION: ${label}`)
  }
  const materialIds = []
  for (const label of splitList(r['Material'])) {
    const v = findValue('MATERIAL', label)
    if (v) materialIds.push(v.id)
    else missingValues.add(`MATERIAL: ${label}`)
  }

  const salesLabel = (r['Sales Responsible'] ?? '').trim()
  const user = findUser(salesLabel)
  if (salesLabel && !user) problems.push(`row ${line}: no user matches "${salesLabel}"`)
  if (user && salesLabel && user.name.toLowerCase().split(' ')[0] !== salesLabel.toLowerCase()) {
    fuzzyUsers.set(salesLabel, user.name)
  }

  const customerName = (r['Customer Name'] ?? '').trim()
  if (!customerName) {
    problems.push(`row ${line}: no customer name - skipped`)
    continue
  }

  prepared.push({
    line,
    jobNumber,
    enquiryDate: parseDate(r['Enquiry Date']),
    salesResponsibleId: user?.id ?? null,
    customerName,
    projectName: (r['Project Name'] ?? '').trim() || null,
    statusValueId: status?.id ?? null,
    locationIds: [...new Set(locationIds)],
    materialIds: [...new Set(materialIds)],
    enquiryDetails: (r['Enquiry Details'] ?? '').trim() || null,
    quoteValue: parseMoney(r['Quote value']),
    probabilityValueId: probability?.id ?? null,
    expectedOrderDate: parseDate(r['Exp Order date']),
    expectedBillingDate: parseDate(r['Exp Billing Date']),
    email: (r['Email'] ?? '').trim().toLowerCase() || null,
    contactPerson: contactPerson || null,
    phoneNumber: fromPhone.phone || null,
    remarks: (r['Remarks'] ?? '').trim() || null,
  })
}

/*
 * A job number can exist only once in a company. The spreadsheet repeats one;
 * the first keeps the number and the other moves to the end of the series
 * rather than being dropped, because both are real requests.
 */
prepared.sort((a, b) => a.jobNumber - b.jobNumber || a.line - b.line)
const taken = new Set()
let nextFree = Math.max(...prepared.map((p) => p.jobNumber)) + 1
for (const row of prepared) {
  if (taken.has(row.jobNumber)) {
    problems.push(
      `row ${row.line}: job ${row.jobNumber} appears twice in the file - this one becomes ${nextFree}`,
    )
    row.jobNumber = nextFree
    nextFree += 1
  }
  taken.add(row.jobNumber)
}
prepared.sort((a, b) => a.jobNumber - b.jobNumber)

const prefix = company.counter?.jobNoPrefix ?? ''
const suffix = company.counter?.jobNoSuffix ?? ''
const first = prepared[0]
const last = prepared[prepared.length - 1]
const countBlank = (key) => prepared.filter((p) => !p[key]).length

console.log(`\nRead ${rows.length} rows, prepared ${prepared.length}.`)
console.log(
  `Job numbers ${formatJobNo(prefix, first.jobNumber, suffix)} to ${formatJobNo(prefix, last.jobNumber, suffix)}`,
)
console.log(`Series continues at ${formatJobNo(prefix, last.jobNumber + 1, suffix)}`)
console.log(`\nContact names recovered from the phone column: ${prepared.filter((p) => p.contactPerson).length}`)
console.log('Blank in the file, left blank here:')
console.log(
  `  status ${countBlank('statusValueId')}   probability ${countBlank('probabilityValueId')}` +
    `   sales responsible ${countBlank('salesResponsibleId')}` +
    `   location ${prepared.filter((p) => p.locationIds.length === 0).length}` +
    `   material ${prepared.filter((p) => p.materialIds.length === 0).length}`,
)

if (fuzzyUsers.size > 0) {
  console.log('\nNames matched loosely - check these:')
  for (const [from, to] of fuzzyUsers) console.log(`  "${from}" -> ${to}`)
}
if (missingValues.size > 0) {
  console.log('\nValues in the file the company does not have:')
  for (const v of missingValues) console.log(`  ${v}`)
}
if (problems.length > 0) {
  console.log('\nProblems:')
  for (const p of problems) console.log(`  ${p}`)
}

console.log('\nA few rows as they will be stored:')
for (const p of [prepared[0], prepared[Math.floor(prepared.length / 2)], last]) {
  console.log(
    '  ' +
      JSON.stringify({
        jobNo: formatJobNo(prefix, p.jobNumber, suffix),
        customer: p.customerName,
        contactPerson: p.contactPerson,
        phone: p.phoneNumber,
        quote: p.quoteValue,
        locations: p.locationIds.length,
        materials: p.materialIds.length,
      }),
  )
}

if (!apply) {
  console.log('\nDry run - nothing written. Re-run with --apply to import.\n')
  await prisma.$disconnect()
  process.exit(0)
}

const existing = await prisma.enquiry.findMany({
  where: { companyId: company.id },
  select: { jobNo: true },
})
const alreadyThere = new Set(existing.map((e) => e.jobNo))

let created = 0
let skipped = 0
let serialNo = company.counter?.nextSerialNo ?? 1

for (const row of prepared) {
  const jobNo = formatJobNo(prefix, row.jobNumber, suffix)
  if (alreadyThere.has(jobNo)) {
    skipped += 1
    continue
  }

  const customer = await prisma.customer.upsert({
    where: { companyId_name: { companyId: company.id, name: row.customerName } },
    create: {
      companyId: company.id,
      name: row.customerName,
      email: row.email,
      contactPerson: row.contactPerson,
      phone: row.phoneNumber,
    },
    // Fill a blank on the customer from this request, but never overwrite what
    // is already recorded there.
    update: {
      email: row.email ?? undefined,
      contactPerson: row.contactPerson ?? undefined,
      phone: row.phoneNumber ?? undefined,
    },
    select: { id: true, name: true },
  })

  await prisma.enquiry.create({
    data: {
      companyId: company.id,
      serialNo,
      jobNo,
      enquiryDate: row.enquiryDate,
      salesResponsibleId: row.salesResponsibleId,
      customerId: customer.id,
      customerName: customer.name,
      projectName: row.projectName,
      statusValueId: row.statusValueId,
      enquiryDetails: row.enquiryDetails,
      quoteValue: row.quoteValue,
      probabilityValueId: row.probabilityValueId,
      expectedOrderDate: row.expectedOrderDate,
      expectedBillingDate: row.expectedBillingDate,
      email: row.email,
      contactPerson: row.contactPerson,
      phoneNumber: row.phoneNumber,
      remarks: row.remarks,
      locations: { create: row.locationIds.map((valueId) => ({ valueId })) },
      materials: { create: row.materialIds.map((valueId) => ({ valueId })) },
    },
  })
  serialNo += 1
  created += 1
}

await prisma.companyCounter.update({
  where: { companyId: company.id },
  data: {
    nextSerialNo: serialNo,
    nextJobNo: Math.max(last.jobNumber + 1, company.counter?.nextJobNo ?? 1000),
  },
})

console.log(`\nImported ${created}, skipped ${skipped} already present.`)
console.log(`Next job number is now ${formatJobNo(prefix, last.jobNumber + 1, suffix)}.\n`)
await prisma.$disconnect()
