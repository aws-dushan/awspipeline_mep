/**
 * Forward a local port to the database, through the app server.
 *
 *   node scripts/deploy/db-tunnel.mjs            # listens on 127.0.0.1:55432
 *
 * The database sits on an internal network. A workstation normally reaches it
 * through a forwarded address that only exists while the VPN is up; when that
 * is down, nothing local can run a migration or drive a local build. The app
 * server can always reach it, so this borrows its route: one SSH connection,
 * a channel per client, no agent or config on either side.
 *
 * Host and port come from `.deploy.env`, with the rest of the deployment
 * details. Point Prisma at it with:
 *
 *   DATABASE_URL="postgresql://<user>:<pass>@127.0.0.1:55432/pipeline_mep"
 */
import net from 'node:net'

import { loadEnv, connectApp } from './remote.mjs'

const LOCAL_PORT = Number(process.env.TUNNEL_PORT ?? 55432)

const env = loadEnv()
if (!env.DB_HOST) throw new Error('Set DB_HOST in .deploy.env')
const remotePort = Number(env.DB_PORT ?? 5432)

const ssh = await connectApp(env)
console.log('SSH established; opening the tunnel')

/*
 * `forwardOut` throws synchronously once the SSH connection has gone, rather
 * than reporting it to the callback, so a dropped session would take the whole
 * tunnel down with an unhandled error instead of one failed query.
 */
const server = net.createServer((socket) => {
  try {
    ssh.forwardOut('127.0.0.1', 0, env.DB_HOST, remotePort, (err, stream) => {
      if (err) {
        console.error('forward failed:', err.message)
        socket.destroy()
        return
      }
      socket.pipe(stream).pipe(socket)
      stream.on('error', () => socket.destroy())
      socket.on('error', () => stream.destroy())
    })
  } catch (error) {
    console.error('SSH is no longer connected:', error.message)
    socket.destroy()
  }
})

ssh.on('close', () => {
  console.error('SSH closed; the tunnel is down. Restart it.')
  process.exit(1)
})

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`listening on 127.0.0.1:${LOCAL_PORT} -> database:${remotePort}`)
  console.log('Ctrl-C to close.')
})

const shutdown = () => {
  server.close()
  ssh.end()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
