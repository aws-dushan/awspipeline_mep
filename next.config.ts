import type { NextConfig } from 'next'

/**
 * The prefix this instance is served under. Empty locally; set to
 * "/awsmepplt" by the Docker build, because the deployment shares one nginx
 * with several applications and each owns a path rather than a hostname.
 */
const basePath = process.env.APP_BASE_PATH || ''

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  // Inlined into the client bundle so hand-written fetches can prefix
  // themselves — Next only rewrites its own navigation.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // A self-contained server bundle, so the runtime image does not need
  // node_modules or a package install.
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['exceljs', 'bcryptjs'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
