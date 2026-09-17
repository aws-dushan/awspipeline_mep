'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

import { brand } from '@/lib/branding'

const EASE = [0.25, 1, 0.5, 1] as const

/**
 * Animated branding panel on the left of the login screen.
 *
 * Every moving part is transform- or opacity-only and runs on the compositor,
 * so the entrance stays at 60fps and the ambient motion costs nothing while
 * the user types. Under `prefers-reduced-motion` the global CSS rule collapses
 * all of it to a static composition.
 */
export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col">
      {/* --- Layer 1: base gradient --------------------------------------- */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 120% at 8% 0%, #3b2790 0%, #241a5c 45%, #140f30 100%)',
        }}
      />

      {/* --- Layer 2: drifting aurora blobs ------------------------------- */}
      <div
        aria-hidden
        className="aurora absolute -left-[18%] top-[-12%] size-[560px] rounded-full opacity-55 blur-[90px]"
        style={{ background: 'radial-gradient(circle, #5a45c8 0%, transparent 68%)' }}
      />
      <div
        aria-hidden
        className="aurora absolute -right-[14%] top-[34%] size-[480px] rounded-full opacity-45 blur-[90px]"
        style={{
          background: 'radial-gradient(circle, #e8681a 0%, transparent 68%)',
          animationDelay: '-8s',
          animationDuration: '26s',
        }}
      />
      <div
        aria-hidden
        className="aurora absolute bottom-[-16%] left-[24%] size-[420px] rounded-full opacity-35 blur-[90px]"
        style={{
          background: 'radial-gradient(circle, #f0813f 0%, transparent 70%)',
          animationDelay: '-15s',
          animationDuration: '30s',
        }}
      />

      {/* --- Layer 3: slowly panning grid --------------------------------- */}
      <div
        aria-hidden
        className="grid-pan absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(90% 80% at 40% 40%, black 20%, transparent 78%)',
        }}
      />

      {/* --- Layer 4: fine noise, to stop the gradient banding ------------ */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* --- Content ------------------------------------------------------ */}
      {/* --- Content: the mark and the product name, nothing else ------- */}
      <div className="relative z-10 flex flex-1 flex-col items-start justify-center gap-10 p-12 xl:p-16">
        <motion.div
          initial={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
        >
          <Image
            src={brand.logoLight}
            alt={brand.name}
            width={256}
            height={256}
            priority
            className="size-28 xl:size-32"
          />
        </motion.div>

        <div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE, delay: 0.34 }}
            className="max-w-md text-balance text-[38px] font-semibold leading-[1.08] tracking-[-0.025em] text-white xl:text-[46px]"
          >
            {brand.productName}
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.6 }}
            className="mt-8 h-px w-44 origin-left"
            style={{
              background: 'linear-gradient(90deg, rgba(255,255,255,0.7), transparent)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
