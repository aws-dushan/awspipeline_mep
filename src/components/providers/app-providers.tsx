'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'sonner'

import { BASE_PATH } from '@/lib/base-path'
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from 'lucide-react'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /**
             * The grid is kept current by SSE push (see `useLiveChannel`).
             * These settings are the safety net for a dropped connection:
             * a slow background refetch plus a refetch when the tab regains
             * focus, so data can never sit stale for long.
             */
            staleTime: 15_000,
            refetchInterval: 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
            // Keep the previous page on screen while the next one loads, so
            // paging and filtering never flash an empty grid.
            placeholderData: <T,>(previous: T) => previous,
          },
          mutations: { retry: 0 },
        },
      }),
  )

  return (
    <SessionProvider
      basePath={`${BASE_PATH}/api/auth`}
      refetchInterval={5 * 60}
      refetchOnWindowFocus
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-right"
          expand
          closeButton
          duration={4200}
          gap={10}
          offset={20}
          toastOptions={{
            classNames: {
              toast:
                'group !rounded-xl !border !border-ink-100 !bg-white !text-ink-800 !shadow-lg !font-sans',
              title: '!text-[13.5px] !font-semibold !text-ink-900',
              description: '!text-[12.5px] !text-ink-500',
              actionButton: '!bg-brand-600 !text-white !rounded-md !text-xs !font-medium',
              cancelButton: '!bg-ink-50 !text-ink-600 !rounded-md !text-xs',
              closeButton: '!bg-white !border-ink-200 !text-ink-400 hover:!text-ink-700',
            },
          }}
          icons={{
            success: <CheckCircle2 className="size-[18px] text-positive" />,
            error: <CircleAlert className="size-[18px] text-negative" />,
            warning: <TriangleAlert className="size-[18px] text-warning" />,
            info: <Info className="size-[18px] text-info" />,
          }}
        />
      </QueryClientProvider>
    </SessionProvider>
  )
}
