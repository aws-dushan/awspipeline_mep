import { NextResponse, type NextRequest } from 'next/server'

import { requireCompanyAccess } from '@/lib/auth/session'
import { subscribe, type RealtimeEvent } from '@/lib/realtime/event-bus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 25_000

/**
 * Server-Sent Events feed for one company.
 *
 * The connection is authorised exactly like any other company-scoped read, so
 * a user cannot subscribe to a company they have no access to and watch its
 * activity. Only change notifications travel over this channel - never record
 * contents - so the client refetches through the normal authorised query.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params

  try {
    await requireCompanyAccess(companyId)
  } catch {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false

      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          )
        } catch {
          closed = true
        }
      }

      send('ready', { companyId, at: Date.now() })

      const unsubscribe = subscribe(companyId, (event: RealtimeEvent) => {
        send('change', event)
      })

      // Proxies drop idle connections; a comment frame keeps it warm without
      // reaching the client as an event.
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        } catch {
          closed = true
        }
      }, HEARTBEAT_MS)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      request.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx buffering the stream into uselessness.
      'X-Accel-Buffering': 'no',
    },
  })
}
