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
import { request } from 'node:https'

const PUBLIC_URL = 'https://ralsnahashho.dyndns.org:1000/awsmepplt'

/**
 * Fetch the public sign-in page and report its status.
 *
 * The deploy verifies the app inside its container and the edge on its
 * published port, because the server cannot reach its own public address -
 * the name resolves to the external IP and nothing routes it back in. Neither
 * check can see the public path, and the public path is what has broken
 * before: the edge kept serving the other sites and answered this prefix with
 * its own default 404, meaning the location block had gone. A workstation can
 * reach the public address, so it is the one place this is worth asking from.
 *
 * The certificate is not validated: it is the edge's, this is a reachability
 * check, and a certificate error would say nothing about the routing.
 */
function publicStatus(url) {
  return new Promise((resolve) => {
    const req = request(url, { rejectUnauthorized: false, timeout: 20000 }, (res) => {
      res.resume()
      resolve(String(res.statusCode))
    })
    req.on('timeout', () => {
      req.destroy()
      resolve('timed out')
    })
    req.on('error', (e) => resolve(e.code ?? 'unreachable'))
    req.end()
  })
}

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

/*
 * The browser pass needs an account on the live system, and a workstation
 * should not be holding the production administrator's password. So it runs
 * only when one is supplied for the run, and says plainly when it does not -
 * a verification that is quietly skipped is worse than one that is absent.
 *
 * The deploy itself is already verified without credentials: the app answers
 * at its prefix inside the container, and the edge routes to it.
 */
console.log('\n=== reach the public address')
const status = await publicStatus(`${PUBLIC_URL}/login`)
console.log(`  ${PUBLIC_URL}/login -> ${status}`)
if (status !== '200') {
  console.error('\nThe deploy succeeded but the public address does not serve it.')
  console.error('Diagnose the edge:  npm run edge:check')
  process.exit(1)
}

const haveCredentials = Boolean(process.env.UI_PASS)

if (!process.argv.includes('--no-verify') && !haveCredentials) {
  console.log('\n=== verify the deployed site')
  console.log('Skipped: no UI_PASS in the environment.')
  console.log(`To run it:  UI_PASS=<admin password> npm run release`)
  console.log('The deploy checks above already confirmed the app and the edge.')
}

if (!process.argv.includes('--no-verify') && haveCredentials) {
  /*
   * Against the deployed site, and read-only.
   *
   * This drives the live system, so it must not leave anything behind. The
   * steps that create a user or save an edit are skipped; run the full set
   * against a local server with UI_ALLOW_WRITES=1 before releasing.
   */
  run('verify the deployed site', process.execPath, ['scripts/ui-check.mjs'], {
    BASE_URL: PUBLIC_URL,
    UI_ALLOW_WRITES: '',
  })
}

console.log(`\nReleased. ${PUBLIC_URL}`)
