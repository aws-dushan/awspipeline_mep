/**
 * Bootstrap seed.
 *
 * Creates only what the application cannot run without:
 *   - the four dropdown *types* (the global catalogue the schema references)
 *   - one administrator account
 *
 * Everything else - companies, users, dropdown values, automation rules,
 * customers and enquiries - is entered by the administrator through the
 * application screens.
 *
 * Safe to re-run: both steps are upserts, and an existing admin password is
 * left untouched.
 */

import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { DROPDOWN_TYPE_SEED } from '../src/lib/database/dropdown-defaults'

const prisma = new PrismaClient()

const ADMIN_USERNAME = (process.env.SEED_ADMIN_USERNAME ?? 'ERP_Admin').toLowerCase()
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'ERP Administrator'
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'erp_admin@awsdistribution.ae').toLowerCase()
/** Required secret. Deliberately has no fallback: a default password
 *  committed to the repository is a default password in production. */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set. Add it to .env before seeding.`)
    process.exit(1)
  }
  return value
}

const ADMIN_PASSWORD = requireEnv('SEED_ADMIN_PASSWORD')

async function main() {
  console.log('Seeding bootstrap data...\n')

  // ---------------------------------------------------------------------------
  // Dropdown types - structural, not business data. The four pipeline columns
  // that are admin-configurable each need their catalogue row to exist before
  // any value can be attached to it.
  // ---------------------------------------------------------------------------
  for (const type of DROPDOWN_TYPE_SEED) {
    await prisma.dropdownType.upsert({
      where: { key: type.key },
      create: type,
      update: { label: type.label, description: type.description },
    })
  }
  console.log(`  dropdown types ready: ${DROPDOWN_TYPE_SEED.map((t) => t.key).join(', ')}`)

  // ---------------------------------------------------------------------------
  // Administrator
  // ---------------------------------------------------------------------------
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] },
    select: { id: true, username: true },
  })

  if (existing) {
    // Do not silently reset a password that may already have been changed.
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: Role.ADMIN, isActive: true, username: ADMIN_USERNAME },
    })
    console.log(`  admin already exists: ${existing.username} (password unchanged)`)
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
    await prisma.user.create({
      data: {
        name: ADMIN_NAME,
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        passwordHash,
        role: Role.ADMIN,
        displayCode: 'ADMIN',
        avatarColor: '#1E4FD8',
      },
    })
    console.log('  admin created')
  }

  const companyCount = await prisma.company.count()

  console.log('\nSeed complete.')
  console.log('  Sign in with')
  console.log(`    Username: ${ADMIN_USERNAME}`)
  console.log(`    Password: ${ADMIN_PASSWORD}${existing ? '  (only if unchanged)' : ''}`)
  if (companyCount === 0) {
    console.log('\n  No companies yet - create the first one from Admin > Companies after signing in.')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
