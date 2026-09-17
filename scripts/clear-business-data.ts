/**
 * Wipe all business data, keeping the schema, the dropdown *types* and the
 * administrator account. Use this to hand over a clean system after testing.
 *
 *   npx tsx scripts/clear-business-data.ts --yes
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log('This deletes every company, user (except administrators),')
    console.log('customer, enquiry, dropdown value and audit entry.')
    console.log('\nRe-run with --yes to confirm.')
    return
  }

  // Ordered so foreign keys are satisfied without relying on cascade order.
  const steps: [string, () => Promise<{ count: number }>][] = [
    ['audit entries', () => prisma.auditLog.deleteMany({})],
    ['delete requests', () => prisma.deleteRequest.deleteMany({})],
    ['enquiries', () => prisma.enquiry.deleteMany({})],
    ['customers', () => prisma.customer.deleteMany({})],
    ['automation rules', () => prisma.automationRule.deleteMany({})],
    ['dropdown values', () => prisma.dropdownValue.deleteMany({})],
    ['supervisor assignments', () => prisma.supervisorAssignment.deleteMany({})],
    ['company assignments', () => prisma.userCompany.deleteMany({})],
    ['sessions', () => prisma.authSession.deleteMany({})],
    ['login attempts', () => prisma.loginAttempt.deleteMany({})],
    ['non-admin users', () => prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } })],
    ['company counters', () => prisma.companyCounter.deleteMany({})],
    ['companies', () => prisma.company.deleteMany({})],
  ]

  for (const [label, run] of steps) {
    const { count } = await run()
    console.log(`  removed ${count} ${label}`)
  }

  const admins = await prisma.user.count({ where: { role: 'ADMIN' } })
  console.log(`\nDone. ${admins} administrator account(s) kept.`)
  console.log('Dropdown types are structural and were left in place.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
