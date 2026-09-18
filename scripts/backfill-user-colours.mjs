/**
 * Give every user still on the untouched default colour one of their own.
 *
 *   node scripts/backfill-user-colours.mjs [--apply]
 *
 * Accounts are created with a colour derived from the name now, but everyone
 * made before that shares one blue - which makes the Sales Responsible column
 * of the pipeline a wall of identical circles. This colours them in.
 *
 * Only accounts still holding the default are touched: a colour somebody chose
 * is a decision, and this is not entitled to overwrite it.
 */
import { PrismaClient } from '@prisma/client'


/*
 * The palette and the hash, copied rather than imported: this is a plain
 * script and `@/lib/branding` is TypeScript behind a path alias. Kept
 * deliberately identical to what the application uses, so a name gets the same
 * colour here as it would on a new account.
 */
const ACCENT_PALETTE = [
  '#302078',
  '#E8681A',
  '#7C3AED',
  '#E0691A',
  '#0E7490',
  '#BE185D',
  '#4D7C0F',
  '#B45309',
]

function accentFor(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length]
}

const DEFAULT_COLOUR = '#1E4FD8'
const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

const everyone = await prisma.user.findMany({
  select: { id: true, name: true, avatarColor: true },
  orderBy: { createdAt: 'asc' },
})
const users = everyone.filter((user) => user.avatarColor === DEFAULT_COLOUR)

/*
 * Handed out so that no two people share one, rather than hashed from the
 * name: hashing put Nisha and Sruty on the same colour, which leaves the
 * column exactly as unreadable as it was. Colours somebody has already chosen
 * are counted as taken.
 */
const taken = new Set(
  everyone.filter((user) => user.avatarColor !== DEFAULT_COLOUR).map((user) => user.avatarColor),
)

console.log(`${users.length} account(s) still on the default colour.`)
for (const user of users) {
  const free = ACCENT_PALETTE.find((colour) => !taken.has(colour))
  // More people than colours: fall back to the name, and accept a repeat.
  const colour = free ?? accentFor(user.name)
  taken.add(colour)

  console.log(`  ${user.name.padEnd(24)} -> ${colour}`)
  if (apply) {
    await prisma.user.update({ where: { id: user.id }, data: { avatarColor: colour } })
  }
}

console.log(apply ? '\nApplied.\n' : '\nDry run - nothing written. Re-run with --apply.\n')
await prisma.$disconnect()
