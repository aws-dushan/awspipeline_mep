import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import { AppProviders } from '@/components/providers/app-providers'
import { brand } from '@/lib/branding'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${brand.name} ${brand.titleSuffix}`,
    template: `%s · ${brand.name}`,
  },
  description: `${brand.productName} for ${brand.name}.`,
  // SVG first for crisp tabs; the PNGs cover Safari and "add to home screen",
  // which ignore SVG favicons.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0b1524',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
