import 'server-only'

import { EventEmitter } from 'node:events'

/**
 * In-process publish/subscribe used to push live updates to open grids.
 *
 * Every mutating server action publishes here; the SSE route in
 * `app/api/companies/[companyId]/stream` subscribes and forwards events to the
 * browser, which invalidates the affected query. Clients also poll on a slow
 * interval, so a missed event self-heals rather than leaving a stale grid.
 *
 * Scope note: this is per Node process. Running several app instances behind a
 * load balancer would need a shared broker (Redis pub/sub) in place of the
 * emitter - `publish`/`subscribe` are the only two functions that would change.
 */

export type RealtimeChannel = 'pipeline' | 'delete-requests' | 'customers' | 'dropdowns' | 'users'

export type RealtimeEvent = {
  channel: RealtimeChannel
  companyId: string
  /** What happened, for optional fine-grained handling on the client. */
  action: string
  /** Who caused it, so a client can skip echoing its own change. */
  actorId: string | null
  /** Primary record the event concerns. */
  entityId?: string | null
  at: number
}

const globalForBus = globalThis as unknown as { __pipelineBus?: EventEmitter }

function bus(): EventEmitter {
  if (!globalForBus.__pipelineBus) {
    const emitter = new EventEmitter()
    // Many browser tabs can be open at once; the default of 10 is far too low
    // and would log spurious leak warnings.
    emitter.setMaxListeners(0)
    globalForBus.__pipelineBus = emitter
  }
  return globalForBus.__pipelineBus
}

function topic(companyId: string) {
  return `company:${companyId}`
}

export function publish(event: Omit<RealtimeEvent, 'at'>): void {
  const payload: RealtimeEvent = { ...event, at: Date.now() }
  bus().emit(topic(event.companyId), payload)
}

export function subscribe(
  companyId: string,
  listener: (event: RealtimeEvent) => void,
): () => void {
  const key = topic(companyId)
  bus().on(key, listener)
  return () => {
    bus().off(key, listener)
  }
}

/** Convenience wrapper for the common pipeline-changed notification. */
export function publishPipelineChange(options: {
  companyId: string
  actorId: string | null
  action: string
  entityId?: string | null
}): void {
  publish({ channel: 'pipeline', ...options })
}
