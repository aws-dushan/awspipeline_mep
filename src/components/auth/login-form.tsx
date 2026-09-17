'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { ArrowRight, Eye, EyeOff, Lock, TriangleAlert, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { brand } from '@/lib/branding'
import { loginSchema, type LoginInput } from '@/lib/validation/auth'
import { cn } from '@/lib/utils'

const EASE = [0.25, 1, 0.5, 1] as const

/**
 * Error codes come back from the Credentials provider. They are mapped to
 * copy here rather than surfaced raw, so the form never leaks whether an
 * account exists.
 */
const ERROR_COPY: Record<string, string> = {
  invalid_credentials: 'Incorrect username or password. Please try again.',
  CredentialsSignin: 'Incorrect username or password. Please try again.',
  rate_limited: 'Too many failed attempts. Please wait 15 minutes before trying again.',
  account_disabled: 'This account has been deactivated. Contact your administrator.',
  no_company_access: 'No company has been assigned to your account yet. Contact your administrator.',
  Configuration: 'Sign-in is not configured correctly. Contact your administrator.',
  default: 'Unable to sign in right now. Please try again.',
}

type Phase = 'form' | 'success'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/select-company'

  const [phase, setPhase] = React.useState<Phase>('form')
  const [showPassword, setShowPassword] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(() => {
    const code = searchParams.get('error')
    return code ? ERROR_COPY[code] ?? ERROR_COPY.default : null
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  // Marks the form as interactive once React has taken it over. Used to keep
  // the submit button disabled pre-hydration, so a fast typist cannot trigger
  // a native browser submit.
  const [hydrated, setHydrated] = React.useState(false)
  React.useEffect(() => setHydrated(true), [])

  async function onSubmit(values: LoginInput) {
    setFormError(null)

    const result = await signIn('credentials', {
      username: values.username,
      password: values.password,
      redirect: false,
    })

    if (!result || result.error) {
      const code = result?.code ?? result?.error ?? 'default'
      setFormError(ERROR_COPY[code] ?? ERROR_COPY.default)
      return
    }

    // Hand over to the branded transition, then navigate. The delay is the
    // length of the exit animation, not artificial latency.
    setPhase('success')
    setTimeout(() => {
      router.replace(callbackUrl)
      router.refresh()
    }, 900)
  }

  return (
    <div className="relative flex w-full max-w-[400px] flex-col">
      <AnimatePresence mode="wait">
        {phase === 'form' ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97, filter: 'blur(4px)' }}
            transition={{ duration: 0.42, ease: EASE, delay: 0.16 }}
          >
            {/* Mobile-only logo: the brand panel is hidden below lg. */}
            <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
              <Image src={brand.mark} alt="" width={48} height={48} className="size-12" />
              <p className="text-[13px] font-medium text-ink-500">{brand.productName}</p>
            </div>

            <header className="mb-7">
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-ink-900">
                Sign in
              </h2>
              <p className="mt-1.5 text-[13.5px] text-ink-500">
                Enter your credentials to continue.
              </p>
            </header>

            <AnimatePresence initial={false}>
              {formError ? (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-md border border-red-200 bg-negative-soft px-3.5 py-3"
                  >
                    <TriangleAlert className="mt-px size-4 shrink-0 text-negative" />
                    <p className="text-[12.5px] leading-relaxed text-red-800">{formError}</p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/*
              `method="post"` matters even though JavaScript handles the
              submit: if the user hits Enter before React has hydrated, the
              browser falls back to a native submit. With the default GET that
              would put their password in the URL, the browser history and the
              server access log. POST keeps it in the request body.
            */}
            <form
              method="post"
              data-hydrated={hydrated ? '' : undefined}
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="flex flex-col gap-4"
            >
              <Field label="Username" htmlFor="username" error={errors.username?.message}>
                <Input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  spellCheck={false}
                  autoCapitalize="none"
                  leading={<User />}
                  invalid={Boolean(errors.username)}
                  {...register('username')}
                />
              </Field>

              <Field label="Password" htmlFor="password" error={errors.password?.message}>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  leading={<Lock />}
                  invalid={Boolean(errors.password)}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="grid size-6 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  }
                  {...register('password')}
                />
              </Field>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!hydrated}
                loading={isSubmitting}
                loadingText="Signing in..."
                className="group mt-2 w-full"
              >
                Sign in
                <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </form>

          </motion.div>
        ) : (
          <SuccessTransition key="success" />
        )}
      </AnimatePresence>
    </div>
  )
}

/** Branded hand-off shown between a successful sign-in and the first screen. */
function SuccessTransition() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="flex min-h-[380px] flex-col items-center justify-center gap-6"
    >
      <div className="relative grid size-20 place-items-center">
        {/* Two expanding rings read as "working", without a spinner. */}
        {[0, 0.45].map((delay) => (
          <motion.span
            key={delay}
            className="absolute inset-0 rounded-2xl border border-brand-300"
            initial={{ scale: 0.7, opacity: 0.85 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeOut', repeat: Infinity, delay }}
          />
        ))}
        <motion.div
          initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className={cn(
            'relative grid size-16 place-items-center rounded-2xl',
            'shadow-brand',
          )}
          style={{ background: 'linear-gradient(135deg, #302078, #E8681A)' }}
        >
          <Image src={brand.logoLight} alt="" width={64} height={64} className="size-11" />
        </motion.div>
      </div>

      <div className="text-center">
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.35 }}
          className="text-[15px] font-semibold text-ink-900"
        >
          Welcome back
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.35 }}
          className="mt-1 text-[13px] text-ink-500"
        >
          Preparing your pipeline...
        </motion.p>
      </div>

      <div className="h-0.5 w-40 overflow-hidden rounded-full bg-ink-100">
        <motion.div
          className="h-full rounded-full bg-brand-600"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 0.85, ease: EASE }}
        />
      </div>
    </motion.div>
  )
}
