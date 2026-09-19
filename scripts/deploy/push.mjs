/**
 * Deploy the Pipeline Tracker to AWS-App.
 *
 *   node scripts/deploy/push.mjs [--no-build]
 *
 * What it does, in order: packs the working tree, uploads it to
 * /opt/aws/mepplms/src, writes the compose file and the runtime environment,
 * builds the image on the server, starts the container on the shared
 * `aws-app_aws-app` network, installs the nginx location and reloads the
 * edge.
 *
 * It is safe to run repeatedly. Nothing outside /opt/aws/mepplms, the one
 * file /opt/aws/edge/apps/awsmepplt.conf and one line of this account's
 * crontab is touched - in particular docker-compose.app.yml and the rest of
 * the edge, which the infrastructure sync owns, are left alone.
 *
 * Secrets are read from the local `.env` and `.deploy.env`, both git-ignored,
 * and are never printed.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs'

import { loadEnv, connectApp, run } from './remote.mjs'

const REMOTE_DIR = '/opt/aws/mepplms'
const EDGE_CONF = '/opt/aws/edge/apps/awsmepplt.conf'
const EDGE_CONTAINER = 'aws-edge-nginx-1'
/** The container nginx proxies to. Its name is internal and does not change. */
const CONTAINER = 'mepplms'
const BASE_PATH = '/awsmepplt'
const PUBLIC_URL = `https://ralsnahashho.dyndns.org:1000${BASE_PATH}`

function localEnv() {
  const env = {}
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

/**
 * Rewrite the development DATABASE_URL for use from inside the container.
 *
 * Development connects through a forwarded address that only exists on a
 * workstation; from the Docker network the database host is reachable
 * directly. That internal address lives in `.deploy.env` alongside the other
 * deployment details - internal addressing is not something the repository
 * should carry.
 */
function databaseUrl(env, ssh) {
  if (!ssh.DB_HOST) {
    throw new Error('Set DB_HOST in .deploy.env - the database address as seen from the app network')
  }
  const url = new URL(env.DATABASE_URL)
  url.hostname = ssh.DB_HOST
  url.port = ssh.DB_PORT ?? '5432'
  return url.toString()
}

/**
 * Pack the working tree.
 *
 * The archive is written to a relative path on purpose. GNU tar reads an
 * absolute Windows path as host:path and tries to open an rsh connection to
 * a machine called "C", which fails in a way that reads like a network
 * problem rather than a quoting one.
 */
function pack() {
  const archive = 'deploy/.artifact.tgz'
  mkdirSync('deploy', { recursive: true })
  execFileSync(
    'tar',
    [
      '-czf', archive,
      '--exclude=./node_modules', '--exclude=./.next', '--exclude=./.git',
      '--exclude=./ui-shots', '--exclude=./tsconfig.tsbuildinfo',
      `--exclude=./${archive}`,
      // Local secrets. Also excluded by .dockerignore, but the archive is a
      // second path off this machine and has to refuse them on its own.
      '--exclude=./.env', '--exclude=./.env.local', '--exclude=./.deploy.env',
      '.',
    ],
    { stdio: 'inherit' },
  )
  return archive
}

function put(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()))
    })
  })
}

/** Write a string to a remote file without it ever appearing in a command line. */
function putText(conn, text, remotePath, mode = '0644') {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      const stream = sftp.createWriteStream(remotePath, { mode: parseInt(mode, 8) })
      stream.on('close', resolve).on('error', reject)
      stream.end(text)
    })
  })
}

const step = (name) => console.log(`\n--- ${name}`)

const skipBuild = process.argv.includes('--no-build')
const env = localEnv()
const ssh = loadEnv()
const app = await connectApp(ssh)

try {
  step('prepare remote directory')
  await run(app, `mkdir -p ${REMOTE_DIR}/src && rm -rf ${REMOTE_DIR}/src/* ${REMOTE_DIR}/src/.[!.]*`)

  step('upload source')
  const archive = pack()
  await put(app, archive, '/tmp/mepplms.tgz')
  unlinkSync(archive)
  await run(app, `tar -xzf /tmp/mepplms.tgz -C ${REMOTE_DIR}/src && rm -f /tmp/mepplms.tgz`)

  step('write compose file')
  await putText(app, readFileSync('deploy/docker-compose.yml', 'utf8'), `${REMOTE_DIR}/docker-compose.yml`)

  step('write runtime environment')
  /*
   * AUTH_SECRET is generated once and then reused. Regenerating it on every
   * deploy would invalidate every signed session cookie, logging out everyone
   * who happened to be working at the time.
   */
  const existing = await run(app, `grep -h '^AUTH_SECRET=' ${REMOTE_DIR}/.env 2>/dev/null || true`, { silent: true })
  const authSecret = existing.stdout.trim().split('=')[1] || randomBytes(32).toString('base64')
  const runtimeEnv = [
    '# Written by scripts/deploy/push.mjs. Secrets - not in version control.',
    `DATABASE_URL="${databaseUrl(env, ssh)}"`,
    `AUTH_SECRET=${authSecret}`,
    /*
     * The edge passes Host and X-Forwarded-Proto, so Auth.js derives its own
     * origin correctly. AUTH_URL is deliberately absent: Auth.js reads a base
     * path out of it, and a prefixed value makes the handler answer 400.
     */
    'AUTH_TRUST_HOST=true',
    /*
     * AUTH_URL carries the ORIGIN and nothing more.
     *
     * Behind the proxy, Next's standalone server builds request.url from the
     * address it binds to, which is 0.0.0.0 - so Auth.js resolved the sign-out
     * callback against http://0.0.0.0:3000 and sent the browser there. Giving
     * it the public origin fixes that.
     *
     * The path must stay /api/auth. Auth.js reads its basePath out of this
     * URL, and Next strips the deployment prefix before the handler runs, so
     * a prefixed path here makes every auth endpoint answer 400.
     */
    `AUTH_URL=${new URL(PUBLIC_URL).origin}/api/auth`,
    `LOGIN_RATE_LIMIT_MAX=${env.LOGIN_RATE_LIMIT_MAX ?? '8'}`,
    `LOGIN_RATE_LIMIT_WINDOW_MS=${env.LOGIN_RATE_LIMIT_WINDOW_MS ?? '900000'}`,
    '',
  ].join('\n')
  await putText(app, runtimeEnv, `${REMOTE_DIR}/.env`, '0600')

  if (!skipBuild) {
    step('build image (this takes a few minutes)')
    const built = await run(app, `cd ${REMOTE_DIR} && docker compose build 2>&1 | tail -30`)
    if (built.code !== 0) throw new Error('image build failed')
  }

  step('start container')
  const up = await run(app, `cd ${REMOTE_DIR} && docker compose up -d`)
  if (up.code !== 0) throw new Error('docker compose up failed')

  step('install edge configuration')
  /*
   * Retire any earlier prefix first.
   *
   * The path is compiled into the image, so after a rename the old location
   * still proxies here and still answers - with HTML whose every asset 404s,
   * which is worse than a clean 404. Matching on the upstream rather than on a
   * remembered filename means this keeps working however many times the prefix
   * changes, and touches no other application's config.
   */
  await run(
    app,
    `grep -l '${CONTAINER}:3000' /opt/aws/edge/apps/*.conf 2>/dev/null ` +
      `| grep -vx '${EDGE_CONF}' | xargs -r rm -f -- ` +
      `&& echo "retired the previous prefix" || true`,
  )
  await putText(app, readFileSync('deploy/awsmepplt.conf', 'utf8'), EDGE_CONF)
  const test = await run(app, `docker exec ${EDGE_CONTAINER} nginx -t`)
  if (test.code !== 0) throw new Error('nginx rejected the configuration; it was NOT reloaded')
  await run(app, `docker exec ${EDGE_CONTAINER} nginx -s reload`)

  step('install the route guard')
  /*
   * The route above does not stay installed on its own.
   *
   * `sync-infra.sh` runs from cron on this host and reconciles
   * /opt/aws/edge/apps against a published infrastructure image, deleting any
   * route that image does not carry. This application is deployed from its
   * own repository and is deliberately not in that image, so its route was
   * being removed minutes after each deploy - the site answered a bare nginx
   * 404 while everything else on the port kept serving.
   *
   * Putting the route in the infrastructure repository would also fix it, and
   * was declined on purpose: a deploy of this project should not require a
   * commit to another one. So the deploy installs a guard that notices the
   * route going missing and puts it back.
   */
  await putText(app, readFileSync('deploy/awsmepplt.conf', 'utf8'), `${REMOTE_DIR}/awsmepplt.conf`)
  await putText(app, readFileSync('deploy/route-guard.sh', 'utf8'), `${REMOTE_DIR}/route-guard.sh`, '0755')

  /*
   * Added to the crontab only if it is not already there, and by rewriting
   * the whole table through a filter rather than appending blindly - a deploy
   * that runs fifty times must leave one line, not fifty. The existing
   * entries are preserved untouched; this host's cron also drives the
   * infrastructure sync and the platform's own deploy.
   */
  const cron = await run(
    app,
    `( crontab -l 2>/dev/null | grep -v 'mepplms/route-guard.sh'; ` +
      `echo '* * * * * ${REMOTE_DIR}/route-guard.sh >/dev/null 2>&1' ) | crontab - ` +
      `&& crontab -l | grep -c 'route-guard.sh'`,
    { silent: true },
  )
  if (cron.stdout.trim() !== '1') throw new Error('could not install the route guard in cron')
  console.log('  guard installed; checks every 20s and restores the route if it is removed')

  step('verify')
  /*
   * Checked from the server's own vantage point, which is not the public one.
   * The server cannot reach its own public address - the name resolves to the
   * external IP and nothing routes it back in - so curling PUBLIC_URL here
   * hangs until curl gives up, thirty times over. The browser check at the end
   * of `npm run release` is what covers the public path; this proves the two
   * hops the server can actually see.
   */
  const verify =
    // 1. The app answers at the prefix, inside its own container.
    `echo "app:  $(docker exec mepplms node -e ` +
    `"fetch('http://127.0.0.1:3000${BASE_PATH}/login').then(r=>console.log(r.status)).catch(e=>console.log(e.code||'unreachable'))")"; ` +
    // 2. The edge routes that prefix to it. The published address comes from
    //    docker rather than a literal, so no internal addressing is written
    //    down here, and the Host header is what the certificate expects.
    `edge=$(docker port ${EDGE_CONTAINER} 1000 | head -1); ` +
    `echo "edge: $(curl -sk -m 10 -o /dev/null -w '%{http_code}' ` +
    `-H 'Host: ${new URL(PUBLIC_URL).hostname}' "https://$edge${BASE_PATH}/login")"; ` +
    `echo "container: $(docker inspect -f '{{.State.Status}} {{.State.Health.Status}}' mepplms)"`

  const checked = await run(app, verify)
  if (!/edge: 200/.test(checked.stdout)) {
    throw new Error('the edge did not serve the application after the reload')
  }

  console.log(`\nDeployed: ${PUBLIC_URL}/login`)
} finally {
  app.end()
}
