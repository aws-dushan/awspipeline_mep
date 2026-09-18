/**
 * Minimal SSH runner for the AWS-App / AWS-Data servers.
 *
 * Credentials come from `.deploy.env`, which is git-ignored - they must never
 * reach the repository.
 *
 *   node scripts/deploy/remote.mjs app  "hostname; uptime"
 *   node scripts/deploy/remote.mjs data "hostname"          # via the app jump host
 *
 * `data` is reached by tunnelling through `app`, because AWS-Data sits on an
 * internal subnet that is not routable from a workstation.
 */
import { Client } from 'ssh2'
import { readFileSync } from 'node:fs'

export function loadEnv(path = '.deploy.env') {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) env[match[1]] = match[2]
  }
  return env
}

/** Connect to the app server. */
export function connectApp(env) {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: env.APP_HOST,
        port: 22,
        username: env.APP_USER,
        password: env.APP_PASS,
        readyTimeout: 25000,
        // Long-lived uses - the database tunnel in particular - sit idle
        // between queries, and the server closes a silent connection.
        keepaliveInterval: 15000,
        keepaliveCountMax: 6,
        // The servers are older Debian builds; allow their key exchange set.
        algorithms: {
          serverHostKey: [
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-rsa',
          ],
        },
      })
  })
}

/** Connect to the data server by tunnelling through the app server. */
export function connectData(env, appConn) {
  return new Promise((resolve, reject) => {
    appConn.forwardOut('127.0.0.1', 0, env.DATA_HOST, 22, (err, stream) => {
      if (err) return reject(err)
      const conn = new Client()
      conn
        .on('ready', () => resolve(conn))
        .on('error', reject)
        .connect({
          sock: stream,
          username: env.DATA_USER,
          password: env.DATA_PASS,
          readyTimeout: 25000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 6,
        })
    })
  })
}

/** Run a command and collect its output. Never throws on a non-zero exit. */
export function run(conn, command, { silent = false } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(command, { pty: false }, (err, stream) => {
      if (err) return reject(err)
      let stdout = ''
      let stderr = ''
      stream
        .on('close', (code) => resolve({ code, stdout, stderr }))
        .on('data', (chunk) => {
          stdout += chunk
          if (!silent) process.stdout.write(chunk)
        })
        .stderr.on('data', (chunk) => {
          stderr += chunk
          if (!silent) process.stderr.write(chunk)
        })
    })
  })
}

// --- CLI ------------------------------------------------------------------
const isMain = process.argv[1]?.endsWith('remote.mjs')
if (isMain) {
  const [, , target, ...rest] = process.argv
  const command = rest.join(' ')
  if (!target || !command) {
    console.error('usage: node scripts/deploy/remote.mjs <app|data> "<command>"')
    process.exit(1)
  }

  const env = loadEnv()
  const app = await connectApp(env)
  try {
    const conn = target === 'data' ? await connectData(env, app) : app
    const { code } = await run(conn, command)
    if (conn !== app) conn.end()
    process.exitCode = code
  } finally {
    app.end()
  }
}
