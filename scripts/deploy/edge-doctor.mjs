/**
 * Diagnose - and optionally repair - the edge routing for /awsmepplt.
 *
 *   node scripts/deploy/edge-doctor.mjs           # report only
 *   node scripts/deploy/edge-doctor.mjs --repair  # reinstall and reload
 *
 * Why this exists: the application has twice gone to a bare nginx 404 while
 * the other sites on the same edge kept serving. A 404 from nginx itself -
 * its default page, not ours - means the request matched no location block,
 * so the fault is the edge's routing and not the container, the app or the
 * database. This finds out which of the handful of possible reasons it is,
 * and prints the evidence rather than guessing.
 *
 * The container is left alone. Nothing here rebuilds or restarts the app.
 */
import { readFileSync } from 'node:fs'

import { loadEnv, connectApp, run } from './remote.mjs'

const EDGE_CONTAINER = 'aws-edge-nginx-1'
const CONTAINER = 'mepplms'
const BASE_PATH = '/awsmepplt'
const CONF_NAME = 'awsmepplt.conf'
const HOST_APPS_DIR = '/opt/aws/edge/apps'
const PUBLIC_HOST = 'ralsnahashho.dyndns.org'

const repair = process.argv.includes('--repair')

const say = (name, value) => console.log(`  ${name.padEnd(34)}${value}`)
const step = (name) => console.log(`\n--- ${name}`)

const app = await connectApp(loadEnv())
const sh = async (command) => (await run(app, command, { silent: true })).stdout.trim()

try {
  step('what the edge is actually serving')

  /*
   * `nginx -T` dumps the configuration as the running process has it, include
   * files and all. It is the only answer that cannot be stale: a file on disk
   * proves nothing if nginx has not been reloaded since it was written, and a
   * reload proves nothing if the file was removed afterwards.
   */
  const loaded = await sh(
    `docker exec ${EDGE_CONTAINER} nginx -T 2>/dev/null | grep -c 'location ${BASE_PATH}' || true`,
  )
  const isRouted = Number(loaded) > 0
  say('location in the running config', isRouted ? `yes (${loaded} blocks)` : 'NO - this is the fault')

  const otherApps = await sh(
    `docker exec ${EDGE_CONTAINER} nginx -T 2>/dev/null | grep -o 'location /[a-z0-9_-]*' | sort -u | tr '\\n' ' ' || true`,
  )
  say('prefixes the edge knows', otherApps || '(none)')

  step('the file that should put it there')

  const confPath = `${HOST_APPS_DIR}/${CONF_NAME}`
  const stat = await sh(`stat -c '%y  %s bytes' ${confPath} 2>/dev/null || echo MISSING`)
  say('conf on the host', stat)
  say('directory contents', (await sh(`ls -1 ${HOST_APPS_DIR} 2>/dev/null | tr '\\n' ' '`)) || '(unreadable)')

  /*
   * A file on the host only reaches nginx through a bind mount. If the edge
   * container is ever recreated against a different compose file, the mount
   * can land somewhere else, and then every deploy writes a config that the
   * running nginx has never seen - which looks exactly like the file being
   * deleted.
   */
  const mounts = await sh(
    `docker inspect -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\\n"}}{{end}}' ${EDGE_CONTAINER}`,
  )
  console.log('  mounts')
  for (const line of mounts.split('\n').filter(Boolean)) console.log(`    ${line}`)

  const mountedInside = await sh(
    `docker exec ${EDGE_CONTAINER} sh -c 'ls -1 /etc/nginx/apps 2>/dev/null | tr "\\n" " "' || true`,
  )
  say('what nginx sees in apps/', mountedInside || '(nothing - check the mount above)')

  step('when things last changed')

  say('edge created', await sh(`docker inspect -f '{{.Created}}' ${EDGE_CONTAINER}`))
  say('edge started', await sh(`docker inspect -f '{{.State.StartedAt}}' ${EDGE_CONTAINER}`))
  say('app container', await sh(`docker inspect -f '{{.State.Status}} since {{.State.StartedAt}}' ${CONTAINER}`))

  /*
   * Docker keeps an event log. If the edge was recreated after the conf was
   * written, that is the whole story and no file was ever deleted.
   */
  const events = await sh(
    `docker events --since 24h --until 0s --filter 'container=${EDGE_CONTAINER}' ` +
      `--format '{{.Time}} {{.Action}}' 2>/dev/null | tail -8 || true`,
  )
  console.log('  edge events (24h)')
  for (const line of events.split('\n').filter(Boolean)) console.log(`    ${line}`)

  step('anything else that writes to this directory')

  /*
   * The other applications on this edge are deployed by their own scripts.
   * One of them rewriting the whole directory instead of its own file would
   * remove this app's config as a side effect, which fits a fault that comes
   * back on no schedule of ours.
   */
  const writers = await sh(
    `grep -rl '${HOST_APPS_DIR}' /opt/aws --include='*.sh' --include='*.mjs' --include='*.js' ` +
      `--include='*.yml' --include='*.yaml' 2>/dev/null | head -20 || true`,
  )
  console.log('  scripts referencing the apps dir')
  for (const line of writers.split('\n').filter(Boolean)) console.log(`    ${line}`)

  const crons = await sh(
    `{ crontab -l 2>/dev/null; cat /etc/cron.d/* 2>/dev/null; } | grep -v '^#' | grep -i -e edge -e nginx -e sync | head -10 || true`,
  )
  console.log('  cron entries touching the edge')
  for (const line of crons.split('\n').filter(Boolean)) console.log(`    ${line}`)

  step('our own guard')

  say(
    'installed',
    await sh(`test -x /opt/aws/mepplms/route-guard.sh && echo yes || echo NO - run npm run deploy`),
  )
  say('scheduled', (await sh(`crontab -l 2>/dev/null | grep -c route-guard.sh`)) === '1' ? 'yes' : 'NO')
  const guardLog = await sh(`tail -5 /opt/aws/mepplms/route-guard.log 2>/dev/null || true`)
  console.log('  repairs it has made')
  for (const line of guardLog.split('\n').filter(Boolean)) console.log(`    ${line}`)

  if (!repair) {
    console.log(
      isRouted
        ? '\nThe edge is routing this prefix. If the browser still 404s, the fault is further out.'
        : '\nRe-run with --repair to reinstall the location and reload the edge.',
    )
  } else {
    step('repair')

    /*
     * Written to the host path the running container actually has mounted,
     * not to the path this script would prefer. Getting that backwards is how
     * a repair reports success and changes nothing.
     */
    const source = mounts
      .split('\n')
      .map((l) => l.split(' -> '))
      .find(([, dest]) => dest?.trim() === '/etc/nginx/apps')?.[0]
      ?.trim()

    if (source && source !== HOST_APPS_DIR) {
      console.log(`  note: nginx reads ${source}, not ${HOST_APPS_DIR} - writing to ${source}`)
    }
    const target = `${source || HOST_APPS_DIR}/${CONF_NAME}`

    const conf = readFileSync(`deploy/${CONF_NAME}`, 'utf8')
    await new Promise((resolve, reject) => {
      app.sftp((err, sftp) => {
        if (err) return reject(err)
        const stream = sftp.createWriteStream(target, { mode: 0o644 })
        stream.on('close', resolve).on('error', reject)
        stream.end(conf)
      })
    })
    say('wrote', target)

    const test = await run(app, `docker exec ${EDGE_CONTAINER} nginx -t`)
    if (test.code !== 0) throw new Error('nginx rejected the configuration; it was NOT reloaded')
    await run(app, `docker exec ${EDGE_CONTAINER} nginx -s reload`)

    const edge = await sh(`docker port ${EDGE_CONTAINER} 1000 | head -1`)
    const status = await sh(
      `curl -sk -m 10 -o /dev/null -w '%{http_code}' -H 'Host: ${PUBLIC_HOST}' ` +
        `"https://${edge}${BASE_PATH}/login"`,
    )
    say('edge now answers', status)
    if (status !== '200') throw new Error(`the edge still answers ${status} after the reload`)
    console.log('\nRouting restored.')
  }
} finally {
  app.end()
}
