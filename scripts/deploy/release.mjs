/**
 * Ship: push the branch to GitHub, then update the deployed portal.
 *
 *   npm run release
 *   npm run release -- --no-verify   # skip the post-deploy browser check
 *
 * The two halves belong together. A push that leaves the running system on
 * older code means the repository and the portal disagree, and the next person
 * to look at either one is reading a lie. So the deploy runs at the end of
 * every push, and a failure in it is a failure of the release.
 *
 * Deliberately refuses to run with uncommitted changes: the image is built
 * from the working tree, so deploying dirty would put code on the server that
 * exists in no commit.
 */
import { execFileSync, spawnSync } from 'node:child_process'

const PUBLIC_URL = 'https://ralsnahashho.dyndns.org:1000/awsmepplms'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function run(label, command, args, env) {
  console.log(`\n=== ${label}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    console.error(`\n${label} failed. The release is incomplete.`)
    process.exit(result.status ?? 1)
  }
}

const dirty = git('status', '--porcelain')
if (dirty) {
  console.error('Working tree is not clean. Commit first - the image is built from these files:\n')
  console.error(dirty)
  process.exit(1)
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
console.log(`Releasing ${branch} @ ${git('rev-parse', '--short', 'HEAD')}`)

run('push to GitHub', 'git', ['push', 'origin', branch])
run('deploy to the portal', process.execPath, ['scripts/deploy/push.mjs'])

if (!process.argv.includes('--no-verify')) {
  // Against the deployed site, not localhost - the point is to check what
  // was just shipped.
  run('verify the deployed site', process.execPath, ['scripts/ui-check.mjs'], {
    BASE_URL: PUBLIC_URL,
  })
}

console.log(`\nReleased. ${PUBLIC_URL}`)
