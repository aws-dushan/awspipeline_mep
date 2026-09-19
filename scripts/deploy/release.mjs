/**
 * Ship: push, then wait for the portal to be running what was pushed.
 *
 *   npm run release
 *   npm run release -- --no-verify   # skip the post-deploy browser check
 *
 * The push IS the deploy now - the Deploy workflow runs on the self-hosted
 * runner on AWS-App - so this no longer deploys anything itself. What it adds
 * is the part a green workflow does not give you: it polls /api/version until
 * the live site reports this very commit, and fails if it never does.
 *
 * That distinction has mattered in this project more than once. A push that
 * returns in a second says nothing about the running system, and "it is
 * pushed" is not "it is live".
 *
 * Deliberately refuses to run with uncommitted changes: the image is built
 * from the commit, so a dirty tree means shipping something that exists on no
 * branch and cannot be looked up later.
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
/**
 * The commit the live site reports it is running.
 *
 * Served by /api/version, compiled into the image at build time. This is what
 * turns "it is pushed" into "it is live" - the one question asked after every
 * deploy, and one that a green workflow does not actually answer.
 */
function deployedSha() {
  return new Promise((resolve) => {
    const req = request(
      `${PUBLIC_URL}/api/version`,
      { rejectUnauthorized: false, timeout: 20000 },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(body).commit ?? null)
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

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

/*
 * The push is the deploy: the Deploy workflow runs on the self-hosted runner
 * on AWS-App and deploys the commit that was just pushed.
 *
 * So this no longer deploys itself. Doing both would put two docker builds on
 * the same eight cores, racing to restart the same container - and whichever
 * finished second would win, which is not always the newer one.
 *
 * `npm run deploy` still deploys directly, for a server CI cannot reach or
 * has never run on.
 */
console.log('\n=== deploy')
console.log('Pushed. The Deploy workflow on AWS-App builds and installs this commit.')
console.log('Watch it:  https://github.com/aws-dushan/awspipeline_mep/actions')

/*
 * Waited for rather than assumed. A push that returns in a second says
 * nothing about whether the site is now running this commit, and "it is
 * pushed" has been mistaken for "it is live" often enough in this project to
 * be worth the wait here.
 */
const head = git('rev-parse', 'HEAD')
const deadline = Date.now() + 20 * 60 * 1000
let live = await deployedSha()

if (live !== head) {
  process.stdout.write('  building')
  while (Date.now() < deadline && live !== head) {
    await new Promise((r) => setTimeout(r, 15000))
    process.stdout.write('.')
    live = await deployedSha()
  }
  process.stdout.write('\n')
}

if (live !== head) {
  console.error(`\nStill serving ${live ?? 'an unknown commit'} after 20 minutes.`)
  console.error('The workflow may have failed, or no runner picked the job up:')
  console.error('  https://github.com/aws-dushan/awspipeline_mep/actions')
  console.error('To deploy without CI:  npm run deploy')
  process.exit(1)
}
console.log(`  live: ${live.slice(0, 7)}`)

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
  console.error('\nThe commit is deployed but the sign-in page does not answer.')
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
