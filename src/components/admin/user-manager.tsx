'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { Controller, useForm } from 'react-hook-form'
import {
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Role } from '@prisma/client'
import type { z } from 'zod'

import { AdminPageHeader, AdminShell } from '@/components/admin/admin-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox, MultiSelect } from '@/components/ui/combobox'
import {
  AnimatedDialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, Switch, Tooltip } from '@/components/ui/primitives'
import { formatRelative } from '@/lib/format'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/permissions'
import { cn, hexWithAlpha, initials } from '@/lib/utils'
import { createUserSchema, updateUserSchema } from '@/lib/validation/admin'
import type { AdminUserRow } from '@/server/actions/admin-actions'
import {
  createUserAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
  updateUserAction,
} from '@/server/actions/admin-actions'

export type CompanyChoice = { id: string; name: string; color: string }

const ROLE_TONE: Record<Role, 'brand' | 'info' | 'neutral'> = {
  ADMIN: 'brand',
  SUPERVISOR: 'info',
  USER: 'neutral',
}

export function UserManager({
  users,
  companies,
  currentUserId,
}: {
  users: AdminUserRow[]
  companies: CompanyChoice[]
  currentUserId: string
}) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<Role | 'ALL'>('ALL')
  const [editing, setEditing] = React.useState<AdminUserRow | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [passwordTarget, setPasswordTarget] = React.useState<AdminUserRow | null>(null)

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((user) => {
      if (roleFilter !== 'ALL' && user.role !== roleFilter) return false
      if (!query) return true
      return (
        user.name.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        (user.displayCode ?? '').toLowerCase().includes(query) ||
        user.companies.some((company) => company.name.toLowerCase().includes(query))
      )
    })
  }, [users, search, roleFilter])

  async function toggleActive(user: AdminUserRow) {
    const result = await toggleUserActiveAction({ userId: user.id, isActive: !user.isActive })
    if (!result.ok) {
      toast.error('Could not update the account', { description: result.error })
      return
    }
    toast.success(result.data.isActive ? `${user.name} reactivated` : `${user.name} deactivated`, {
      description: result.data.isActive
        ? 'They can sign in again.'
        : 'Their active sessions have been ended.',
    })
    router.refresh()
  }

  return (
    <AdminShell>
      <AdminPageHeader
        title="Users"
        description="Create accounts, assign companies, and set who each person reports to. Supervisors approve deletion requests from their direct reports."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            className="group"
          >
            <Plus className="transition-transform duration-200 group-hover:rotate-90" />
            New user
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[280px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, company..."
            leading={<Search />}
          />
        </div>

        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as Role | 'ALL')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            {Object.values(Role).map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-[12.5px] text-ink-400 tabular">
          {filtered.length} of {users.length}
        </span>
      </div>

      <div className="panel overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
              <Users className="size-5" />
            </span>
            <p className="text-[14px] font-medium text-ink-700">No users match that search</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            <AnimatePresence initial={false}>
              {filtered.map((user) => (
                <motion.li
                  key={user.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    'group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-ink-50/70',
                    !user.isActive && 'bg-ink-50/40',
                  )}
                >
                  <Avatar name={user.name} color={user.avatarColor} size="lg" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'truncate text-[14px] font-semibold text-ink-900',
                          !user.isActive && 'text-ink-500',
                        )}
                      >
                        {user.name}
                      </span>
                      {user.displayCode ? (
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-ink-500">
                          {user.displayCode}
                        </span>
                      ) : null}
                      {user.id === currentUserId ? (
                        <Badge tone="brand" size="sm">
                          You
                        </Badge>
                      ) : null}
                      {!user.isActive ? (
                        <Badge tone="neutral" size="sm">
                          Inactive
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
                      <span className="font-medium text-ink-600">{user.username}</span>
                      <span className="text-ink-300"> · </span>
                      {user.email}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <Badge tone={ROLE_TONE[user.role]} size="sm">
                      {user.role === 'ADMIN' ? <ShieldCheck className="size-3" /> : null}
                      {ROLE_LABELS[user.role]}
                    </Badge>
                    {user.supervisor ? (
                      <span className="truncate text-[11.5px] text-ink-400">
                        Reports to {user.supervisor.name}
                      </span>
                    ) : user.role !== 'ADMIN' ? (
                      <span className="truncate text-[11.5px] text-warning">
                        No supervisor
                      </span>
                    ) : null}
                  </div>

                  <div className="hidden min-w-[180px] flex-wrap gap-1 lg:flex">
                    {user.role === 'ADMIN' ? (
                      <span className="text-[11.5px] text-ink-400">All companies</span>
                    ) : user.companies.length === 0 ? (
                      <span className="text-[11.5px] text-warning">None assigned</span>
                    ) : (
                      user.companies.slice(0, 3).map((company) => (
                        <span
                          key={company.id}
                          className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                          style={{
                            backgroundColor: hexWithAlpha(company.color, 0.12),
                            color: company.color,
                          }}
                        >
                          {initials(company.name)}
                        </span>
                      ))
                    )}
                    {user.companies.length > 3 ? (
                      <span className="text-[10.5px] text-ink-400">
                        +{user.companies.length - 3}
                      </span>
                    ) : null}
                  </div>

                  <span className="hidden w-28 shrink-0 text-right text-[11.5px] text-ink-400 xl:block">
                    {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never signed in'}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    <Tooltip content="Reset password">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => setPasswordTarget(user)}
                        aria-label={`Reset password for ${user.name}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <KeyRound />
                      </Button>
                    </Tooltip>

                    <Tooltip content="Edit user">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => {
                          setEditing(user)
                          setDialogOpen(true)
                        }}
                        aria-label={`Edit ${user.name}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Pencil />
                      </Button>
                    </Tooltip>

                    <Tooltip
                      content={
                        user.id === currentUserId
                          ? 'You cannot deactivate your own account'
                          : user.isActive
                            ? 'Deactivate'
                            : 'Reactivate'
                      }
                    >
                      <span>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          disabled={user.id === currentUserId}
                          onClick={() => toggleActive(user)}
                          aria-label={user.isActive ? 'Deactivate' : 'Reactivate'}
                          className={cn(
                            'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                            !user.isActive && 'opacity-100',
                          )}
                        >
                          {user.isActive ? <UserX /> : <UserCheck />}
                        </Button>
                      </span>
                    </Tooltip>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editing}
        users={users}
        companies={companies}
        onSaved={() => router.refresh()}
      />

      <PasswordDialog
        user={passwordTarget}
        onOpenChange={(open) => !open && setPasswordTarget(null)}
      />
    </AdminShell>
  )
}

type CreateValues = z.input<typeof createUserSchema>

const USER_FIELD_LABELS: Record<string, string> = {
  name: 'Full name',
  username: 'Username',
  email: 'Email',
  role: 'Role',
  password: 'Password',
  companyIds: 'Companies',
  defaultCompanyId: 'Default company',
  supervisorId: 'Reports to',
}

function UserDialog({
  open,
  onOpenChange,
  user,
  users,
  companies,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AdminUserRow | null
  users: AdminUserRow[]
  companies: CompanyChoice[]
  onSaved: () => void
}) {
  const isEdit = Boolean(user)
  const [showPassword, setShowPassword] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const defaultValues = React.useMemo(
    () => ({
      name: user?.name ?? '',
      username: user?.username ?? '',
      email: user?.email ?? '',
      role: user?.role ?? Role.USER,
      isActive: user?.isActive ?? true,
      companyIds: user?.companies.map((company) => company.id) ?? [],
      defaultCompanyId: user?.companies.find((company) => company.isDefault)?.id ?? '',
      supervisorId: user?.supervisor?.id ?? '',
      password: '',
    }),
    [user],
  )

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(isEdit ? (updateUserSchema as never) : (createUserSchema as never)),
    defaultValues,
  })

  React.useEffect(() => {
    if (open) {
      reset(defaultValues)
      setShowPassword(false)
      setFormError(null)
    }
  }, [open, defaultValues, reset])

  const role = watch('role')
  const companyIds = watch('companyIds') ?? []

  // A user cannot report to themselves, and only supervisors or admins are
  // meaningful as approvers.
  const supervisorOptions = React.useMemo(
    () =>
      users
        .filter(
          (candidate) =>
            candidate.id !== user?.id &&
            candidate.isActive &&
            (candidate.role === 'SUPERVISOR' || candidate.role === 'ADMIN'),
        )
        .map((candidate) => ({
          value: candidate.id,
          label: candidate.name,
          description: ROLE_LABELS[candidate.role],
          leading: <Avatar name={candidate.name} color={candidate.avatarColor} size="xs" />,
        })),
    [users, user?.id],
  )

  async function submit(values: CreateValues) {
    setFormError(null)

    const result = isEdit
      ? await updateUserAction({ ...values, userId: user!.id })
      : await createUserAction(values)

    if (!result.ok) {
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof CreateValues, { type: 'server', message })
      }
      // Say what actually blocked the save rather than a generic sentence -
      // the offending control may be scrolled out of view.
      const first = Object.values(result.fieldErrors ?? {})[0]
      setFormError(first ?? result.error)
      toast.error(isEdit ? 'Could not save the user' : 'Could not create the user', {
        description: first ?? result.error,
      })
      return
    }

    toast.success(isEdit ? 'User updated' : 'User created')
    onOpenChange(false)
    onSaved()
  }

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="drawer" size="md">
        <DialogHeader eyebrow={isEdit ? ROLE_LABELS[user!.role] : 'New account'}>
          <DialogTitle>{isEdit ? 'Edit user' : 'Create user'}</DialogTitle>
          <DialogDescription>
            Company access and the reporting line are enforced server-side on every request.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <FormErrorSummary
              message={formError}
              fieldErrors={Object.fromEntries(
                Object.entries(errors)
                  .filter(([, error]) => error?.message)
                  .map(([field, error]) => [field, String(error?.message)]),
              )}
              labels={USER_FIELD_LABELS}
            />

            <Field
              label="Full name"
              htmlFor="user-name"
              required
              error={errors.name?.message}
            >
              <Input
                id="user-name"
                autoFocus
                invalid={Boolean(errors.name)}
                {...register('name')}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Username"
                htmlFor="user-username"
                required
                error={errors.username?.message}
                hint="What they type to sign in."
              >
                <Input
                  id="user-username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  invalid={Boolean(errors.username)}
                  {...register('username')}
                />
              </Field>

              <Field
                label="Email"
                htmlFor="user-email"
                required
                error={errors.email?.message}
                hint="Contact address only."
              >
                <Input
                  id="user-email"
                  type="email"
                  autoComplete="off"
                  invalid={Boolean(errors.email)}
                  {...register('email')}
                />
              </Field>
            </div>

            {!isEdit ? (
              <Field
                label="Temporary password"
                htmlFor="user-password"
                required
                error={errors.password?.message}
                hint="At least 8 characters with an uppercase letter and a number."
              >
                <Input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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
            ) : null}

            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Field label="Role" required error={errors.role?.message}>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(Role).map((value) => (
                        <SelectItem key={value} value={value}>
                          {ROLE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
                    {ROLE_DESCRIPTIONS[field.value as Role]}
                  </p>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="companyIds"
              render={({ field }) => (
                <Field
                  label="Companies"
                  required={role !== Role.ADMIN}
                  error={errors.companyIds?.message as string | undefined}
                  hint={
                    role === Role.ADMIN
                      ? 'Administrators can reach every company regardless of this list.'
                      : 'The user can only see the pipelines of these companies.'
                  }
                >
                  <div className="rounded-md border border-ink-200 bg-white">
                    <MultiSelect
                      options={companies.map((company) => ({
                        value: company.id,
                        label: company.name,
                        leading: (
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: company.color }}
                          />
                        ),
                      }))}
                      values={field.value ?? []}
                      onChange={field.onChange}
                      maxHeight={170}
                      emptyText="No companies created yet"
                    />
                  </div>
                </Field>
              )}
            />

            {companyIds.length > 1 ? (
              <Controller
                control={control}
                name="defaultCompanyId"
                render={({ field }) => (
                  <Field
                    label="Default company"
                    error={errors.defaultCompanyId?.message}
                    hint="Opened first when they sign in."
                  >
                    <Combobox
                      options={companies
                        .filter((company) => companyIds.includes(company.id))
                        .map((company) => ({ value: company.id, label: company.name }))}
                      value={field.value || null}
                      onChange={(value) => field.onChange(value ?? '')}
                      placeholder="Ask each time"
                    />
                  </Field>
                )}
              />
            ) : null}

            <Controller
              control={control}
              name="supervisorId"
              render={({ field }) => (
                <Field
                  label="Reports to"
                  error={errors.supervisorId?.message}
                  hint="Their deletion requests are routed to this person for approval."
                >
                  <Combobox
                    options={supervisorOptions}
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? '')}
                    placeholder="No supervisor (routes to admins)"
                    emptyText="No supervisors or admins available"
                  />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-ink-100 bg-ink-50/60 px-3.5 py-3">
                  <span>
                    <span className="block text-[13px] font-medium text-ink-800">Active</span>
                    <span className="block text-[12px] text-ink-500">
                      Deactivating ends their sessions immediately.
                    </span>
                  </span>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
  )
}

function PasswordDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserRow | null
  onOpenChange: (open: boolean) => void
}) {
  const [password, setPassword] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (user) {
      setPassword('')
      setShow(false)
      setError(null)
    }
  }, [user])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!user) return

    setSubmitting(true)
    setError(null)
    const result = await resetUserPasswordAction({ userId: user.id, password })
    setSubmitting(false)

    if (!result.ok) {
      setError(result.fieldErrors?.password ?? result.error)
      return
    }

    toast.success(`Password reset for ${user.name}`, {
      description: 'Their existing sessions have been ended.',
    })
    onOpenChange(false)
  }

  return (
    <AnimatedDialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader eyebrow={user?.email}>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a temporary password and share it with {user?.name.split(' ')[0]} directly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <Field
              label="New password"
              required
              error={error ?? undefined}
              hint="At least 8 characters with an uppercase letter and a number."
            >
              <Input
                autoFocus
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                invalid={Boolean(error)}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="grid size-6 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                  >
                    {show ? <EyeOff /> : <Eye />}
                  </button>
                }
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={submitting}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </AnimatedDialog>
  )
}
