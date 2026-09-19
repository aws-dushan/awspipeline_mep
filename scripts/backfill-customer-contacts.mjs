/**
 * Fill blank customer contact details from the requests raised against them.
 *
 *   node scripts/backfill-customer-contacts.mjs [--apply]
 *
 * Saving a request now teaches the customer book anything it is missing, but
 * customers added before that kept whatever they were created with - which,
 * for one added from the picker with only a name, is nothing. The details sat
 * on the request where nobody looking up the customer would find them.
 *
 * Only blanks are written, and only from requests that carry a value. Where
 * the customer already has a detail it is left alone even if a request says
 * something different: a request may name a site contact of its own, and that
 * is not grounds for overwriting the number everyone else dials.
 *
 * The oldest request wins for each field, on the grounds that it is the one
 * the customer was set up from. Prints what it would do; writes only with
 * --apply.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

const clean = (value) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const customers = await prisma.customer.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    contactPerson: true,
    phone: true,
    company: { select: { name: true } },
    enquiries: {
      where: { isDeleted: false },
      // Oldest first: the request the customer was created alongside.
      orderBy: { createdAt: 'asc' },
      select: { jobNo: true, email: true, contactPerson: true, phoneNumber: true },
    },
  },
})

let changed = 0

for (const customer of customers) {
  const data = {}
  const from = {}

  for (const enquiry of customer.enquiries) {
    const offered = {
      email: clean(enquiry.email),
      contactPerson: clean(enquiry.contactPerson),
      phone: clean(enquiry.phoneNumber),
    }
    for (const [field, value] of Object.entries(offered)) {
      const column = field === 'phone' ? 'phone' : field
      if (!value) continue
      if (clean(customer[column])) continue
      if (data[column]) continue
      data[column] = value
      from[column] = enquiry.jobNo
    }
  }

  const fields = Object.keys(data)
  if (fields.length === 0) continue

  changed += 1
  console.log(`${customer.company.name} | ${customer.name}`)
  for (const field of fields) console.log(`    ${field}: ${data[field]}   (from ${from[field]})`)

  if (apply) {
    await prisma.customer.update({ where: { id: customer.id }, data })
  }
}

console.log(
  changed === 0
    ? '\nEvery customer already carries the details their requests hold.'
    : apply
      ? `\nFilled in ${changed} customer${changed === 1 ? '' : 's'}.`
      : `\n${changed} customer${changed === 1 ? '' : 's'} would be filled in. Re-run with --apply to write.`,
)

await prisma.$disconnect()
