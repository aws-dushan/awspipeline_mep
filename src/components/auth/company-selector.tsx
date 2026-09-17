'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, LogOut, Plus, Settings2 } from 'lucide-react'
import { signOut } from 'next-auth/react'

import { Button } from '@/components/ui/button'
import { brand } from '@/lib/branding'
import type { CompanyAccess } from '@/lib/auth/session'
import { cn, hexWithAlpha, initials } from '@/lib/utils'
import { withBasePath } from '@/lib/base-path'

const EASE = [0.25, 1, 0.5, 1] as const

export function CompanySelector({
  userName,
  companies,
  isAdmin,
}: {
  userName: string
  companies: CompanyAccess[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [selecting, setSelecting] = React.useState<string | null>(null)

  function choose(company: CompanyAccess) {
    setSelecting(company.id)
    router.push(`/c/${company.id}/pipeline`)
  }

  const firstName = userName.split(' ')[0]

  return (
    <main className="relative min-h-dvh overflow-hidden bg-canvas">
      {/* Ambient brand wash, matching the login screen so the transition
          between the two feels continuous. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 50% at 50% -8%, rgba(48,32,120,0.10) 0%, transparent 65%)',
        }}
      />
      <div
        aria-hidden
        className="aurora pointer-events-none absolute -right-40 top-20 size-[420px] rounded-full opacity-25 blur-[100px]"
        style={{ background: 'radial-gradient(circle, #e8681a 0%, transparent 70%)' }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <Image
            src={brand.logoDark}
            alt={brand.name}
            width={128}
            height={128}
            priority
            className="size-10"
          />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
            {brand.name}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: withBasePath('/login') })}
          className="text-ink-500"
        >
          <LogOut />
          Sign out
        </Button>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-6 pb-20 pt-10 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <p className="text-[13.5px] font-medium text-brand-600">Welcome, {firstName}</p>
          <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.025em] text-ink-900">
            Select a company
          </h1>
          <p className="mt-2 max-w-lg text-[14px] text-ink-500">
            Your pipeline, dropdowns and approvals are kept separate for each company.
          </p>
        </motion.div>

        {companies.length === 0 ? (
          <EmptyCompanies isAdmin={isAdmin} />
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.07, delayChildren: 0.18 } },
            }}
            className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {companies.map((company) => (
              <motion.button
                key={company.id}
                type="button"
                onClick={() => choose(company)}
                disabled={selecting !== null}
                variants={{
                  hidden: { opacity: 0, y: 18, scale: 0.97 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { duration: 0.45, ease: EASE },
                  },
                }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.2, ease: EASE }}
                className={cn(
                  'group relative overflow-hidden rounded-xl border border-ink-100 bg-white p-6 text-left',
                  'shadow-sm transition-shadow duration-200 hover:shadow-lg',
                  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15',
                  selecting && selecting !== company.id && 'opacity-45',
                )}
              >
                {/* Company accent bleeds in from the top on hover. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out-quart group-hover:scale-x-100"
                  style={{ backgroundColor: company.color }}
                />
                <span
                  aria-hidden
                  className="absolute -right-12 -top-12 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                  style={{ backgroundColor: hexWithAlpha(company.color, 0.22) }}
                />

                <div className="relative flex items-start justify-between">
                  <span
                    className="grid size-12 place-items-center rounded-lg text-[15px] font-bold"
                    style={{
                      backgroundColor: hexWithAlpha(company.color, 0.12),
                      color: company.color,
                    }}
                  >
                    {company.logoUrl ? (
                      <Image
                        src={company.logoUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="size-12 rounded-lg object-cover"
                      />
                    ) : (
                      initials(company.name)
                    )}
                  </span>

                  {company.isDefault ? (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
                      Default
                    </span>
                  ) : null}
                </div>

                <h2 className="relative mt-5 text-[16px] font-semibold tracking-[-0.01em] text-ink-900">
                  {company.name}
                </h2>
                <p className="relative mt-1 text-[12.5px] text-ink-400">
                  {company.currency}
                </p>

                <span className="relative mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600">
                  {selecting === company.id ? 'Opening...' : 'Open pipeline'}
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </motion.button>
            ))}

            {isAdmin ? (
              <motion.a
                href="/admin/companies"
                variants={{
                  hidden: { opacity: 0, y: 18, scale: 0.97 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { duration: 0.45, ease: EASE },
                  },
                }}
                whileHover={{ y: -4 }}
                className={cn(
                  'group grid place-items-center rounded-xl border border-dashed border-ink-200 bg-white/60 p-6',
                  'transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50/40',
                )}
              >
                <span className="flex flex-col items-center gap-2 text-center">
                  <span className="grid size-10 place-items-center rounded-full bg-ink-100 text-ink-500 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700">
                    <Plus className="size-4" />
                  </span>
                  <span className="text-[13.5px] font-medium text-ink-600">Add a company</span>
                  <span className="text-[12px] text-ink-400">Manage in admin settings</span>
                </span>
              </motion.a>
            ) : null}
          </motion.div>
        )}
      </div>
    </main>
  )
}

function EmptyCompanies({ isAdmin }: { isAdmin: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}
      className="mt-10 flex flex-col items-center gap-5 rounded-xl border border-dashed border-ink-200 bg-white/70 px-8 py-16 text-center"
    >
      <span className="grid size-14 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Building2 className="size-6" />
      </span>
      <div>
        <h2 className="text-[17px] font-semibold text-ink-900">
          {isAdmin ? 'No companies yet' : 'No company assigned'}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
          {isAdmin
            ? 'Create your first company to start building its pipeline. You can add users, dropdown values and automation rules straight afterwards.'
            : 'Your administrator has not given your account access to a company yet.'}
        </p>
      </div>
      {isAdmin ? (
        <Button asChild variant="primary" size="lg">
          <a href="/admin/companies">
            <Settings2 />
            Create the first company
          </a>
        </Button>
      ) : (
        <Button variant="secondary" asChild>
          <a href={`mailto:${brand.supportEmail}`}>Contact your administrator</a>
        </Button>
      )}
    </motion.div>
  )
}
