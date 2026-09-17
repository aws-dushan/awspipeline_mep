'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

export function AdminPageHeader({
  title,
  description,
  backHref,
  backLabel = 'Back',
  actions,
  className,
}: {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
      className={cn('flex flex-wrap items-end justify-between gap-4', className)}
    >
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-400 transition-colors hover:text-brand-600"
          >
            <ArrowLeft className="size-3.5" />
            {backLabel}
          </Link>
        ) : null}
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.div>
  )
}

/** Consistent page frame for the admin screens. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-5 p-4 sm:p-6">{children}</div>
}

export function AdminPanel({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div className={cn('panel overflow-hidden', padded && 'p-0', className)}>{children}</div>
  )
}
