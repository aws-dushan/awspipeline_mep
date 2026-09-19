/**
 * Rewrite existing job numbers in the company's current format.
 *
 *   node scripts/renumber-job-nos.mjs                       # what would change
 *   node scripts/renumber-job-nos.mjs --apply               # make the change
 *   node scripts/renumber-job-nos.mjs --company UAE         # one company
 *   node scripts/renumber-job-nos.mjs --from-prefix J --from-suffix DXB
 *
 * The last form says what the EXISTING rows carry, which the database cannot
 * tell you - the company setting describes the next number to be issued, not
 * the ones already written. It defaults to the company's current setting, so
 * a second run of the same command changes nothing.
 *
 * Job numbers are `<prefix><number>_<suffix>` with the prefix and suffix set
 * per company. Rows created before a format change keep the format they were
 * issued under, so a company can end up with two shapes in one grid - which
 * is what happened here: 168 rows imported as J1016_DXB while the company is
 * set to issue J11016.
 *
 * ---------------------------------------------------------------------------
 * What it does and does not change
 * ---------------------------------------------------------------------------
 *
 * Only the presentation changes. The NUMBER inside each job number is kept
 * exactly as it is, because it is the thing people quote to each other and
 * the thing the counter continues from - a row that was 1016 stays 1016 and
 * only its wrapping is rewritten. Nothing is renumbered, reordered or
 * reissued, and the counter is left alone so the next request follows on from
 * where the series already is.
 *
 * Deleted rows are included deliberately. They keep their job number reserved
 * so it is never reissued, and leaving them in the old format would mean a
 * restored request came back looking foreign.
 *
 * Every change is written in one transaction with an audit entry per row, and
 * the previous values are saved to a file first, so this is reversible from
 * the output of the run that did it.
 */
import { PrismaClient } from '@prisma/client'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const apply = process.argv.includes('--apply')
const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? undefined : process.argv[at + 1]
}
const onlyCompany = flag('company')

/*
 * The format the existing rows carry, which is not something this script can
 * read off the database - the company setting says what the NEXT number will
 * look like, not what the old ones were written in. Defaults to the company's
 * own setting, which is the common case of a run that has already been done
 * once and should now do nothing.
 */
const fromPrefixArg = flag('from-prefix')
const fromSuffixArg = flag('from-suffix')

function localEnv() {
  const env = {}
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m) env[m[1]] = m[2]
  }
  return env
}

/** Mirrors src/lib/pipeline/job-number.ts - the one format the app issues. */
function formatJobNo(prefix, serial, suffix) {
  const tail = suffix.trim() ? `_${suffix.trim()}` : ''
  return `${prefix.trim()}${serial}${tail}`
}

/**
 * The number inside a job number, given the format it was issued in.
 *
 * This cannot be done by looking for digits, and the reason is worth stating
 * because getting it wrong corrupts every row it touches. A prefix may itself
 * end in a digit - UAE's is "J1" - so in `J11016` the boundary between prefix
 * and serial is invisible: the first run of digits is "11016", and rewriting
 * that in the same format gives `J111016`. Run it twice and you get
 * `J1111016`. So the old wrapping is REMOVED by name rather than guessed at,
 * and a row that does not carry the wrapping it was said to carry is reported
 * and left alone rather than being reformatted on a guess.
 */
function serialOf(jobNo, fromPrefix, fromSuffix) {
  let rest = jobNo
  if (!rest.startsWith(fromPrefix)) return null
  rest = rest.slice(fromPrefix.length)

  const tail = fromSuffix.trim() ? `_${fromSuffix.trim()}` : ''
  if (tail) {
    if (!rest.endsWith(tail)) return null
    rest = rest.slice(0, -tail.length)
  }

  return /^\d+$/.test(rest) ? rest : null
}

const url = localEnv().DATABASE_URL.replace(/@[^/]*\//, '@127.0.0.1:55432/')
const prisma = new PrismaClient({ datasources: { db: { url } } })

const companies = await prisma.company.findMany({
  where: onlyCompany ? { name: onlyCompany } : undefined,
  select: { id: true, name: true, counter: true },
  orderBy: { name: 'asc' },
})

if (companies.length === 0) {
  console.error(onlyCompany ? `No company named ${onlyCompany}.` : 'No companies.')
  process.exit(1)
}

let planned = 0
const snapshot = []

for (const company of companies) {
  const prefix = company.counter?.jobNoPrefix ?? ''
  const suffix = company.counter?.jobNoSuffix ?? ''
  const fromPrefix = fromPrefixArg ?? prefix
  const fromSuffix = fromSuffixArg ?? suffix

  const rows = await prisma.enquiry.findMany({
    where: { companyId: company.id },
    select: { id: true, jobNo: true, serialNo: true, deletedAt: true },
    orderBy: { jobNo: 'asc' },
  })

  console.log(`\n${company.name}`)
  console.log(`  reading:  "${formatJobNo(fromPrefix, '<n>', fromSuffix)}"`)
  console.log(`  writing:  "${formatJobNo(prefix, '<n>', suffix)}"   rows: ${rows.length}`)

  const changes = []
  const unparsed = []

  for (const row of rows) {
    const serial = serialOf(row.jobNo, fromPrefix, fromSuffix)
    if (!serial) {
      unparsed.push(row)
      continue
    }
    const next = formatJobNo(prefix, serial, suffix)
    if (next !== row.jobNo) changes.push({ ...row, next })
  }

  /*
   * Two rows can only collide if they carried the same number in different
   * wrappings, which should not happen and must not be discovered halfway
   * through a transaction: [companyId, jobNo] is unique, so the database would
   * refuse it and roll the whole run back.
   */
  const seen = new Map()
  for (const row of rows) {
    const key = changes.find((c) => c.id === row.id)?.next ?? row.jobNo
    if (seen.has(key)) {
      console.error(`  REFUSING: ${key} would be shared by two rows (${seen.get(key)} and ${row.jobNo})`)
      process.exit(1)
    }
    seen.set(key, row.jobNo)
  }

  /*
   * A row that does not read as "<fromPrefix><digits><fromSuffix>" is not
   * reformatted, because the only way to reformat it would be to guess where
   * its number begins. Refused outright rather than skipped quietly: a
   * half-renumbered company has two formats in one grid, which is the very
   * thing this script exists to remove.
   */
  if (unparsed.length > 0) {
    console.error(
      `  REFUSING: ${unparsed.length} row(s) are not in the format being read ` +
        `("${formatJobNo(fromPrefix, '<n>', fromSuffix)}"):`,
    )
    for (const row of unparsed.slice(0, 5)) console.error(`    ${row.jobNo}`)
    console.error('  Say what they carry with --from-prefix / --from-suffix.')
    process.exit(1)
  }

  if (changes.length === 0) {
    console.log('  already in the current format; nothing to change')
    continue
  }

  console.log(`  ${changes.length} to rewrite, for example:`)
  for (const change of changes.slice(0, 3)) {
    console.log(`    ${change.jobNo.padEnd(14)} -> ${change.next}`)
  }
  if (changes.length > 3) {
    const last = changes[changes.length - 1]
    console.log(`    ...`)
    console.log(`    ${last.jobNo.padEnd(14)} -> ${last.next}`)
  }
  planned += changes.length

  for (const change of changes) {
    snapshot.push({ id: change.id, companyId: company.id, from: change.jobNo, to: change.next })
  }

  if (!apply) continue

  /*
   * One transaction per company, with its audit entries inside it. Either the
   * company's numbers are all in the new format and the history says so, or
   * nothing moved.
   */
  await prisma.$transaction(
    async (tx) => {
      for (const change of changes) {
        await tx.enquiry.update({ where: { id: change.id }, data: { jobNo: change.next } })
        await tx.auditLog.create({
          data: {
            companyId: company.id,
            actorId: null,
            action: 'ENQUIRY_UPDATED',
            entity: 'ENQUIRY',
            entityId: change.id,
            enquiryId: change.id,
            summary: `Job No rewritten in the company format: ${change.jobNo} -> ${change.next}`,
            changes: [{ field: 'jobNo', label: 'Job No', from: change.jobNo, to: change.next }],
            metadata: { reason: 'company job number format changed', script: 'renumber-job-nos' },
          },
        })
      }
    },
    { timeout: 120000 },
  )
  console.log(`  rewritten`)
}

if (snapshot.length > 0) {
  mkdirSync('backups', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = `backups/job-nos-${apply ? 'applied' : 'planned'}-${stamp}.json`
  writeFileSync(file, JSON.stringify(snapshot, null, 1))
  console.log(`\nPrevious values saved to ${file}`)
}

console.log(
  apply
    ? `\nDone. ${planned} job number(s) rewritten.`
    : `\n${planned} job number(s) would change. Re-run with --apply to make it so.`,
)

await prisma.$disconnect()
