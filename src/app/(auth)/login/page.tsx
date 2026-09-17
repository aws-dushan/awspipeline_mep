import { Suspense } from 'react'
import type { Metadata } from 'next'

import { BrandPanel } from '@/components/auth/brand-panel'
import { LoginForm } from '@/components/auth/login-form'
import { Spinner } from '@/components/ui/primitives'
import { brand } from '@/lib/branding'

export const metadata: Metadata = {
  // `absolute` opts out of the root template. Setting the product name through
  // the template would render it twice, once as the page and once as the
  // suffix.
  title: { absolute: brand.productName },
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BrandPanel />

      <div className="relative flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        {/* A very soft brand wash, so the form side is not a flat white box. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 55% at 50% 0%, rgba(48,32,120,0.05) 0%, transparent 70%)',
          }}
        />
        <Suspense
          fallback={
            <div className="grid min-h-[380px] place-items-center">
              <Spinner className="size-6" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}

export const dynamic = 'force-dynamic'
