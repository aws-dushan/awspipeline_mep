/**
 * Set a company's job number format.
 *
 *   node scripts/set-jobno-format.mjs <company> <prefix> [suffix]
 *   node scripts/set-jobno-format.mjs UAE J1
 *   node scripts/set-jobno-format.mjs UAE J DXB
 *
 * The same thing the admin screen does, for when the change has to be made
 * alongside a renumbering of the existing rows - run this first, then
 * `renumber-job-nos.mjs`, so the rows are rewritten in the format the counter
 * will issue next.
 *
 * Writes the same audit entry the screen writes, because a job number format
 * change is visible on every row and should never appear out of nowhere in
 * the history. The counter itself is not touched: the series carries on from
 * where it is, in the new wrapping.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const [name, prefix, suffix = ''] = process.argv.slice(2)
if (!name || prefix === undefined) {
  console.error('usage: node scripts/set-jobno-format.mjs <company> <prefix> [suffix]')
  process.exit(1)
}

const env = {}
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
  if (m) env[m[1]] = m[2]
}

const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL.replace(/@[^/]*\//, '@127.0.0.1:55432/') } },
})

const preview = (n) => `${prefix}${n}${suffix ? `_${suffix}` : ''}`

try {
  const company = await prisma.company.findFirst({
    where: { name },
    select: { id: true, name: true, counter: true },
  })
  if (!company?.counter) throw new Error(`no company named ${name}, or it has no counter`)

  const before = { prefix: company.counter.jobNoPrefix, suffix: company.counter.jobNoSuffix }

  if (before.prefix === prefix && before.suffix === suffix) {
    console.log(`${name}: already "${preview('<n>')}"`)
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.companyCounter.update({
        where: { companyId: company.id },
        data: { jobNoPrefix: prefix, jobNoSuffix: suffix },
      })
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorId: null,
          action: 'COMPANY_UPDATED',
          entity: 'COMPANY',
          entityId: company.id,
          summary: `Job No format changed to "${preview('<n>')}"`,
          changes: [
            { field: 'jobNoPrefix', label: 'Job No prefix', from: before.prefix, to: prefix },
            { field: 'jobNoSuffix', label: 'Job No suffix', from: before.suffix, to: suffix },
          ],
        },
      })
    })
    console.log(
      `${name}: "${before.prefix}<n>${before.suffix ? `_${before.suffix}` : ''}" -> "${preview('<n>')}"`,
    )
  }

  console.log(`the next request will be ${preview(company.counter.nextJobNo)}`)
  console.log('existing rows keep their old format until renumber-job-nos.mjs is run')
} finally {
  await prisma.$disconnect()
}
