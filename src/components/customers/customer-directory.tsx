'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Mail, Pencil, Phone, Plus, Search, User } from 'lucide-react'

import { AdminPageHeader, AdminShell } from '@/components/admin/admin-page-header'
import {
  CustomerFormDialog,
  type CustomerDraft,
} from '@/components/customers/customer-form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLiveChannel } from '@/hooks/use-live-channel'
import type { CustomerOption } from '@/lib/database/customer-repository'
import { RelativeTime } from '@/components/ui/relative-time'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Customer book for one company.
 *
 * Customers are created inline from the enquiry drawer as well; this screen is
 * for browsing what exists and adding entries ahead of time.
 */
export function CustomerDirectory({
  companyId,
  currentUserId,
  customers,
  canCreate,
}: {
  companyId: string
  currentUserId: string
  customers: CustomerOption[]
  canCreate: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [editing, setEditing] = React.useState<CustomerDraft | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  function openCreate() {
    setEditing({ name: '', email: null, contactPerson: null, phone: null })
    setDialogOpen(true)
  }

  function openEdit(customer: CustomerOption) {
    setEditing({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      isActive: customer.isActive,
    })
    setDialogOpen(true)
  }

  useLiveChannel(companyId, {
    channels: ['customers'],
    onEvent: (event) => {
      if (event.actorId === currentUserId) return
      router.refresh()
    },
  })

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return customers
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        (customer.email ?? '').toLowerCase().includes(query) ||
        (customer.contactPerson ?? '').toLowerCase().includes(query) ||
        (customer.phone ?? '').toLowerCase().includes(query),
    )
  }, [customers, search])

  return (
    <AdminShell>
      <AdminPageHeader
        title="Customers"
        description="The list users pick from when raising an enquiry. Adding one here means it is ready before the next request comes in."
        backHref={`/c/${companyId}/pipeline`}
        backLabel="Back to pipeline"
        actions={
          canCreate ? (
            <Button variant="primary" onClick={openCreate} className="group">
              <Plus className="transition-transform duration-200 group-hover:rotate-90" />
              New customer
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[300px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, contact, email or phone..."
            leading={<Search />}
          />
        </div>
        <span className="ml-auto text-[12.5px] text-ink-400 tabular">
          {filtered.length} of {customers.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-ink-200 bg-white/70 px-6 py-20 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Building2 className="size-5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink-900">
              {customers.length === 0 ? 'No customers yet' : 'No customers match that search'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-500">
              {customers.length === 0
                ? 'Customers are added here, or on the fly while raising an enquiry.'
                : 'Try a different name, email or phone number.'}
            </p>
          </div>
          {canCreate && customers.length === 0 ? (
            <Button variant="primary" onClick={openCreate}>
              <Plus />
              New customer
            </Button>
          ) : null}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence initial={false}>
            {filtered.map((customer) => (
              <motion.article
                key={customer.id}
                layout
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.3, ease: [0.25, 1, 0.5, 1] },
                  },
                }}
                className={cn(
                  'panel group flex flex-col gap-3 p-4 transition-shadow duration-200 hover:shadow-md',
                  !customer.isActive && 'opacity-65',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600">
                    <Building2 className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-900">
                        {customer.name}
                      </h2>
                      {canCreate ? (
                        <button
                          type="button"
                          onClick={() => openEdit(customer)}
                          aria-label={`Edit ${customer.name}`}
                          className="grid size-7 shrink-0 place-items-center rounded-sm text-ink-400 opacity-0 transition-all hover:bg-ink-100 hover:text-ink-700 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-ink-400">
                      {customer.enquiryCount > 0
                        ? `${formatNumber(customer.enquiryCount)} ${customer.enquiryCount === 1 ? 'request' : 'requests'}`
                        : 'No requests yet'}
                      {customer.lastEnquiryAt ? (
                        <>
                          {' · last '}
                          <RelativeTime value={customer.lastEnquiryAt} />
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 border-t border-ink-100 pt-3 text-[12.5px]">
                  {customer.email ? (
                    <a
                      href={`mailto:${customer.email}`}
                      className="flex min-w-0 items-center gap-2 text-brand-600 transition-colors hover:text-brand-700"
                    >
                      <Mail className="size-3.5 shrink-0 text-ink-400" />
                      <span className="truncate">{customer.email}</span>
                    </a>
                  ) : null}
                  {customer.contactPerson ? (
                    <span className="flex min-w-0 items-center gap-2 text-ink-600">
                      <User className="size-3.5 shrink-0 text-ink-400" />
                      <span className="truncate">{customer.contactPerson}</span>
                    </span>
                  ) : null}
                  {customer.phone ? (
                    <span className="flex min-w-0 items-center gap-2 text-ink-600">
                      <Phone className="size-3.5 shrink-0 text-ink-400" />
                      <span className="truncate tabular">{customer.phone}</span>
                    </span>
                  ) : null}
                  {!customer.email && !customer.contactPerson && !customer.phone ? (
                    <span className="text-[12px] text-ink-300">No contact details</span>
                  ) : null}
                </div>

                {customer.enquiryCount > 0 ? (
                  <Link
                    href={`/c/${companyId}/pipeline?customerName=${encodeURIComponent(customer.name)}`}
                    className="text-[12.5px] font-medium text-brand-600 underline-offset-2 hover:underline"
                  >
                    View their requests
                  </Link>
                ) : null}
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <CustomerFormDialog
        companyId={companyId}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        customer={editing}
        onSaved={() => router.refresh()}
      />
    </AdminShell>
  )
}

