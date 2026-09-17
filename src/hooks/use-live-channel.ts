'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { apiPath } from '@/lib/base-path'

export type RealtimeChannel = 'pipeline' | 'delete-requests' | 'customers' | 'dropdowns' | 'users'

export type RealtimeEvent = {
  channel: RealtimeChannel
  companyId: string
  action: string
  actorId: string | null
  entityId?: string | null
  at: number
}

export type LiveStatus = 'connecting' | 'live' | 'offline'

type Listener = (event: RealtimeEvent) => void

/**
 * One EventSource per company, shared by every component on the page.
 *
 * Without this registry each grid, badge and counter would open its own SSE
 * connection and browsers cap concurrent connections per origin at six.
 */
const connections = new Map<
  string,
  {
    source: EventSource
    listeners: Set<Listener>
    statusListeners: Set<(status: LiveStatus) => void>
    status: LiveStatus
    retry: number
    retryTimer: ReturnType<typeof setTimeout> | null
  }
>()

function setStatus(companyId: string, status: LiveStatus) {
  const entry = connections.get(companyId)
  if (!entry || entry.status === status) return
  entry.status = status
  entry.statusListeners.forEach((listener) => listener(status))
}

function connect(companyId: string) {
  const existing = connections.get(companyId)
  if (existing?.source && existing.source.readyState !== EventSource.CLOSED) return existing

  const entry = existing ?? {
    source: null as unknown as EventSource,
    listeners: new Set<Listener>(),
    statusListeners: new Set<(status: LiveStatus) => void>(),
    status: 'connecting' as LiveStatus,
    retry: 0,
    retryTimer: null,
  }

  const source = new EventSource(apiPath(`/api/companies/${companyId}/stream`))
  entry.source = source
  connections.set(companyId, entry)
  setStatus(companyId, 'connecting')

  source.addEventListener('ready', () => {
    entry.retry = 0
    setStatus(companyId, 'live')
  })

  source.addEventListener('change', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as RealtimeEvent
      entry.listeners.forEach((listener) => listener(payload))
    } catch {
      /* malformed frame - ignore rather than tear down the stream */
    }
  })

  source.onerror = () => {
    source.close()
    setStatus(companyId, 'offline')

    if (entry.listeners.size === 0 && entry.statusListeners.size === 0) {
      connections.delete(companyId)
      return
    }

    // Exponential backoff, capped: a server restart should not turn into a
    // reconnect storm from every open tab.
    entry.retry = Math.min(entry.retry + 1, 6)
    const delay = Math.min(1000 * 2 ** entry.retry, 30_000)
    entry.retryTimer = setTimeout(() => connect(companyId), delay)
  }

  return entry
}

function release(companyId: string, listener: Listener, statusListener: (status: LiveStatus) => void) {
  const entry = connections.get(companyId)
  if (!entry) return
  entry.listeners.delete(listener)
  entry.statusListeners.delete(statusListener)

  if (entry.listeners.size === 0 && entry.statusListeners.size === 0) {
    if (entry.retryTimer) clearTimeout(entry.retryTimer)
    entry.source?.close()
    connections.delete(companyId)
  }
}

/**
 * Subscribe to live changes for a company.
 *
 * Returns the connection status so the UI can show whether the grid is
 * genuinely live or has fallen back to polling.
 */
export function useLiveChannel(
  companyId: string,
  options: {
    channels?: RealtimeChannel[]
    onEvent?: (event: RealtimeEvent) => void
    enabled?: boolean
  } = {},
): LiveStatus {
  const { channels, onEvent, enabled = true } = options
  const [status, setLocalStatus] = React.useState<LiveStatus>('connecting')

  // Keep the newest callback without re-subscribing on every render.
  const handlerRef = React.useRef(onEvent)
  handlerRef.current = onEvent
  const channelsKey = channels?.join(',') ?? ''

  React.useEffect(() => {
    if (!enabled || !companyId) return

    const allowed = channelsKey ? new Set(channelsKey.split(',')) : null

    const listener: Listener = (event) => {
      if (allowed && !allowed.has(event.channel)) return
      handlerRef.current?.(event)
    }
    const statusListener = (next: LiveStatus) => setLocalStatus(next)

    const entry = connect(companyId)
    entry.listeners.add(listener)
    entry.statusListeners.add(statusListener)
    setLocalStatus(entry.status)

    return () => release(companyId, listener, statusListener)
  }, [companyId, channelsKey, enabled])

  return status
}

/**
 * Invalidate React Query caches whenever a matching live event arrives.
 *
 * `skipOwnEvents` stops a user's own save from triggering a second refetch on
 * top of the one the mutation already performed.
 */
export function useLiveQueryInvalidation(options: {
  companyId: string
  channels: RealtimeChannel[]
  queryKeys: readonly unknown[][]
  currentUserId?: string
  skipOwnEvents?: boolean
  onEvent?: (event: RealtimeEvent) => void
  enabled?: boolean
}): LiveStatus {
  const queryClient = useQueryClient()
  const { companyId, channels, queryKeys, currentUserId, skipOwnEvents = false, onEvent, enabled } = options

  const keysSignature = JSON.stringify(queryKeys)

  const handleEvent = React.useCallback(
    (event: RealtimeEvent) => {
      if (skipOwnEvents && currentUserId && event.actorId === currentUserId) return
      const keys = JSON.parse(keysSignature) as unknown[][]
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
      onEvent?.(event)
    },
    [queryClient, keysSignature, currentUserId, skipOwnEvents, onEvent],
  )

  return useLiveChannel(companyId, { channels, onEvent: handleEvent, enabled })
}
