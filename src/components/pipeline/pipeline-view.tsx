'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileX2, Inbox, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import {
  customerOptions,
  dropdownOptions,
  EnquiryDrawer,
  userOptions,
} from '@/components/pipeline/enquiry-drawer'
import { DeleteRequestDialog } from '@/components/pipeline/delete-request-dialog'
import { PipelineGrid } from '@/components/pipeline/pipeline-grid'
import { PipelinePagination } from '@/components/pipeline/pipeline-pagination'
import { PipelineToolbar } from '@/components/pipeline/pipeline-toolbar'
import type { FilterOptions } from '@/components/pipeline/filters/column-filter'
import { Button } from '@/components/ui/button'
import { useLiveQueryInvalidation } from '@/hooks/use-live-channel'
import type { CustomerOption } from '@/lib/database/customer-repository'
import type { DropdownCatalogue } from '@/lib/database/dropdown-repository'
import type { PipelinePage, PipelineRow } from '@/lib/database/enquiry-repository'
import {
  activeFilterColumns,
  clearColumnFilter,
  countActiveFilters,
  EMPTY_FILTERS,
  parseEnquiryFilters,
  serializeEnquiryFilters,
  type EnquiryFilters,
  type SortableKey,
} from '@/lib/filters/enquiry-filters'
import type { AutomationRule } from '@/lib/pipeline/automation'
import type { PipelineColumnKey } from '@/lib/pipeline/columns'
import { apiPath, withBasePath } from '@/lib/base-path'
import { canEditEnquiry } from '@/lib/permissions'
import type { EnquiryFormInput } from '@/lib/validation/enquiry'
import {
  createEnquiryAction,
  requestEnquiryDeletionAction,
  updateEnquiryAction,
} from '@/server/actions/enquiry-actions'
import type { Role } from '@prisma/client'

export type PipelineViewProps = {
  company: { id: string; name: string; currency: string }
  viewer: {
    id: string
    name: string
    role: Role
    supervisorName: string | null
    canCreate: boolean
    canExport: boolean
    canRequestDelete: boolean
  }
  catalogue: DropdownCatalogue
  members: { id: string; name: string; displayCode: string | null; avatarColor: string }[]
  customers: CustomerOption[]
  automationRules: AutomationRule[]
  /** Which fields this company insists on, decided in admin settings. */
  requiredFields: string[]
  initialFilters: EnquiryFilters
  initialPage: PipelinePage
}

export function PipelineView({
  company,
  viewer,
  catalogue,
  members,
  customers: initialCustomers,
  automationRules,
  requiredFields,
  initialFilters,
  initialPage,
}: PipelineViewProps) {
  const pathname = usePathname()
  const queryClient = useQueryClient()

  /**
   * Filters are client state, mirrored into the address bar.
   *
   * They are deliberately *not* driven through `router.replace`: that would
   * re-run this page's server component on every keystroke and checkbox - a
   * full render plus its database queries - while React Query fetched the same
   * rows again anyway. Writing the URL with `history.replaceState` keeps the
   * view shareable and refresh-safe, and leaves exactly one request per change.
   *
   * `usePathname()` reports the path *without* the deployment prefix, so it
   * has to be put back before writing. Without that the address bar loses the
   * prefix, and because a Server Action posts to whatever the current URL is,
   * the next save goes to a path nginx does not route and 404s. It presents as
   * "an unexpected response was received from the server" on a screen that
   * worked a moment earlier.
   */
  const [filters, setFilters] = React.useState<EnquiryFilters>(initialFilters)

  React.useEffect(() => {
    const query = serializeEnquiryFilters(filters, { includePaging: true }).toString()
    const base = withBasePath(pathname)
    const next = query ? `${base}?${query}` : base
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, '', next)
    }
  }, [filters, pathname])

  // Back/forward still work: re-read the filters the URL was restored to.
  React.useEffect(() => {
    const onPopState = () => {
      setFilters(parseEnquiryFilters(new URLSearchParams(window.location.search)))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const queryString = React.useMemo(() => {
    const params = serializeEnquiryFilters(filters, { includePaging: true })
    params.set('companyId', company.id)
    return params.toString()
  }, [filters, company.id])

  const {
    data: page,
    isFetching,
    refetch,
  } = useQuery<PipelinePage>({
    queryKey: ['pipeline', company.id, queryString],
    queryFn: async ({ signal }) => {
      const response = await fetch(apiPath(`/api/enquiries?${queryString}`), { signal })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Unable to load the pipeline.')
      }
      return response.json() as Promise<PipelinePage>
    },
    // The server component already rendered the first page; reuse it so the
    // grid is populated on first paint rather than flashing skeletons.
    initialData:
      queryString ===
      (() => {
        const params = serializeEnquiryFilters(initialFilters, { includePaging: true })
        params.set('companyId', company.id)
        return params.toString()
      })()
        ? initialPage
        : undefined,
    placeholderData: keepPreviousData,
  })

  const [customers, setCustomers] = React.useState(initialCustomers)
  const [highlightedIds, setHighlightedIds] = React.useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PipelineRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<PipelineRow | null>(null)
  const [exporting, setExporting] = React.useState(false)

  /** Flash a row, then let the highlight fade out on its own. */
  const highlight = React.useCallback((id: string) => {
    setHighlightedIds((current) => new Set(current).add(id))
    window.setTimeout(() => {
      setHighlightedIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, 2600)
  }, [])

  // --- Live updates --------------------------------------------------------
  const liveStatus = useLiveQueryInvalidation({
    companyId: company.id,
    channels: ['pipeline', 'dropdowns', 'customers'],
    queryKeys: [['pipeline', company.id]],
    currentUserId: viewer.id,
    skipOwnEvents: true,
    onEvent: (event) => {
      if (event.channel !== 'pipeline' || !event.entityId) return
      highlight(event.entityId)
      if (event.action === 'enquiry.created') {
        toast.info('New request added', {
          description: 'Someone on your team just added a request.',
        })
      }
    },
  })

  // --- Filter helpers ------------------------------------------------------
  const applyFilters = React.useCallback(
    (patch: Partial<EnquiryFilters>, options: { resetPage?: boolean } = {}) => {
      setFilters((current) => ({
        ...current,
        ...patch,
        // Any change to the predicate invalidates the current page number.
        ...(options.resetPage === false ? {} : { page: 1 }),
      }))
    },
    [],
  )

  // Debounce the free-text search so a query is not issued per keystroke.
  const [searchDraft, setSearchDraft] = React.useState(filters.q ?? '')
  React.useEffect(() => setSearchDraft(filters.q ?? ''), [filters.q])

  React.useEffect(() => {
    const current = filters.q ?? ''
    if (searchDraft === current) return
    const timer = window.setTimeout(() => {
      applyFilters({ q: searchDraft || undefined })
    }, 320)
    return () => window.clearTimeout(timer)
  }, [searchDraft, filters.q, applyFilters])

  const filterCount = countActiveFilters(filters)
  const activeColumns = React.useMemo(() => activeFilterColumns(filters), [filters])

  const filterOptions = React.useMemo<FilterOptions>(
    () => ({
      status: dropdownOptions(catalogue.STATUS),
      location: dropdownOptions(catalogue.LOCATION),
      material: dropdownOptions(catalogue.MATERIAL),
      probability: dropdownOptions(catalogue.PROBABILITY),
      users: userOptions(members),
      customers: customerOptions(customers),
    }),
    [catalogue, members, customers],
  )

  function handleClearColumn(column: PipelineColumnKey) {
    setFilters((current) => ({ ...clearColumnFilter(current, column), page: 1 }))
  }

  function handleClearAll() {
    setFilters(EMPTY_FILTERS)
  }

  function handleSort(key: SortableKey) {
    const sameColumn = filters.sortBy === key
    applyFilters({
      sortBy: key,
      sortDir: sameColumn && filters.sortDir === 'desc' ? 'asc' : 'desc',
    })
  }

  // --- Mutations -----------------------------------------------------------
  async function refreshCustomers() {
    try {
      const response = await fetch(apiPath(`/api/customers?companyId=${company.id}`))
      if (response.ok) setCustomers((await response.json()) as CustomerOption[])
    } catch {
      /* the picker still works with the list it has */
    }
  }

  /**
   * Save a row edited in the grid.
   *
   * Deliberately the same server action and the same schema as the drawer -
   * editing in place changes where the fields are, not what may be saved. Only
   * the reporting differs: there is no form to show a summary banner in, so a
   * failure is a toast and the offending cells are marked.
   */
  async function handleInlineSave(row: PipelineRow, values: EnquiryFormInput) {
    const result = await updateEnquiryAction({
      companyId: company.id,
      enquiryId: row.id,
      data: values,
    })

    if (!result.ok) {
      toast.error('Could not save the changes', { description: result.error })
      return { ok: false, fieldErrors: result.fieldErrors }
    }

    await queryClient.invalidateQueries({ queryKey: ['pipeline', company.id] })

    const changeCount = 'changeCount' in result.data ? result.data.changeCount : 0
    if (changeCount > 0) {
      toast.success('Request updated', {
        description: `${changeCount} ${changeCount === 1 ? 'field' : 'fields'} recorded in the audit history.`,
      })
      highlight(row.id)
    }
    return { ok: true }
  }

  async function handleSubmit(values: EnquiryFormInput) {
    const result = editing
      ? await updateEnquiryAction({ companyId: company.id, enquiryId: editing.id, data: values })
      : await createEnquiryAction({ companyId: company.id, data: values })

    if (!result.ok) {
      toast.error(editing ? 'Could not save the changes' : 'Could not add the request', {
        description: result.error,
      })
      return { ok: false, fieldErrors: result.fieldErrors }
    }

    await queryClient.invalidateQueries({ queryKey: ['pipeline', company.id] })

    if (editing) {
      const changeCount = 'changeCount' in result.data ? result.data.changeCount : 0
      toast.success('Request updated', {
        description:
          changeCount > 0
            ? `${changeCount} ${changeCount === 1 ? 'field' : 'fields'} recorded in the audit history.`
            : 'No fields changed.',
      })
      highlight(editing.id)
    } else {
      const created = result.data as { id: string; jobNo: string }
      toast.success(`Job ${created.jobNo} added`, {
        description: 'It is now at the top of the pipeline.',
      })
      // A new row is newest-first, so returning to page 1 reveals it.
      if ((filters.page ?? 1) !== 1) applyFilters({})
      highlight(created.id)
      void refreshCustomers()
    }

    return { ok: true }
  }

  async function handleDeleteRequest(reason: string) {
    if (!deleteTarget) return false
    const result = await requestEnquiryDeletionAction({
      companyId: company.id,
      enquiryId: deleteTarget.id,
      reason,
    })

    if (!result.ok) {
      toast.error('Could not submit the request', { description: result.error })
      return false
    }

    await queryClient.invalidateQueries({ queryKey: ['pipeline', company.id] })
    toast.success('Deletion request submitted', {
      description: result.data.supervisorName
        ? `Sent to ${result.data.supervisorName} for approval.`
        : 'Sent to an administrator for approval.',
    })
    return true
  }

  async function handleExport() {
    setExporting(true)
    const toastId = toast.loading('Building your Excel file...')
    try {
      const params = serializeEnquiryFilters(filters)
      params.set('companyId', company.id)

      const response = await fetch(apiPath(`/api/export?${params.toString()}`))
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'The export failed.')
      }

      const rowCount = response.headers.get('X-Row-Count')
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${company.name}_Pipeline.xlsx`

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      toast.success('Export ready', {
        id: toastId,
        description: `${rowCount ?? ''} ${rowCount === '1' ? 'row' : 'rows'} exported to ${filename}`,
      })
    } catch (error) {
      toast.error('Export failed', {
        id: toastId,
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setExporting(false)
    }
  }

  const rows = page?.rows ?? []
  const summary = page ?? initialPage

  return (
    /*
     * A definite height, not just a minimum.
     *
     * The shell is `min-h-dvh`, so nothing below it has a height to resolve
     * against and `flex-1` children grow with their content instead of
     * sharing a fixed space. On this screen that means 168 rows push the page
     * itself down the window and take the grid's horizontal scrollbar with
     * them. Pinning the screen to the viewport minus the header gives the grid
     * something to fit inside, so it scrolls and the page does not.
     */
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col gap-3 p-4 sm:p-5">
      <PipelineToolbar
        companyName={company.name}
        currency={company.currency}
        summary={{
          total: summary.total,
          totalQuoteValue: summary.summary.totalQuoteValue,
        }}
        filters={filters}
        filterCount={filterCount}
        filterOptions={filterOptions}
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onClearFilters={handleClearAll}
        onRemoveFilter={handleClearColumn}
        onAddRequest={() => {
          setEditing(null)
          setDrawerOpen(true)
        }}
        onExport={handleExport}
        exporting={exporting}
        canCreate={viewer.canCreate}
        canExport={viewer.canExport}
        loading={isFetching}
      />

      <PipelineGrid
        rows={rows}
        loading={isFetching && rows.length === 0}
        currency={company.currency}
        filters={filters}
        activeColumns={activeColumns}
        filterOptions={filterOptions}
        highlightedIds={highlightedIds}
        canEdit={(row) =>
          canEditEnquiry(
            { id: viewer.id, role: viewer.role },
            { createdById: row.createdById, salesResponsibleId: row.salesResponsibleId },
          )
        }
        canRequestDelete={viewer.canRequestDelete}
        onInlineSave={handleInlineSave}
        onEdit={(row) => {
          setEditing(row)
          setDrawerOpen(true)
        }}
        onRequestDelete={setDeleteTarget}
        onFilterChange={(patch) => applyFilters(patch)}
        onClearColumn={handleClearColumn}
        onSort={handleSort}
        emptyState={
          <EmptyState
            filtered={filterCount > 0}
            canCreate={viewer.canCreate}
            onClear={handleClearAll}
            onAdd={() => {
              setEditing(null)
              setDrawerOpen(true)
            }}
            onRefresh={() => void refetch()}
          />
        }
      />

      <PipelinePagination
        page={summary.page}
        pageCount={summary.pageCount}
        pageSize={summary.pageSize}
        total={summary.total}
        liveStatus={liveStatus}
        onPageChange={(next) => applyFilters({ page: next }, { resetPage: false })}
        onPageSizeChange={(size) => applyFilters({ pageSize: size })}
      />

      <EnquiryDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setEditing(null)
        }}
        companyId={company.id}
        currency={company.currency}
        record={editing}
        options={{
          status: filterOptions.status,
          location: filterOptions.location,
          material: filterOptions.material,
          probability: filterOptions.probability,
          users: filterOptions.users,
          customers: filterOptions.customers,
        }}
        automationRules={automationRules}
        requiredFields={requiredFields}
        defaultSalesResponsibleId={viewer.id}
        onSubmit={handleSubmit}
        onCustomerCreated={refreshCustomers}
      />

      <DeleteRequestDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        record={deleteTarget}
        currency={company.currency}
        supervisorName={viewer.supervisorName}
        onSubmit={handleDeleteRequest}
      />
    </div>
  )
}

function EmptyState({
  filtered,
  canCreate,
  onClear,
  onAdd,
  onRefresh,
}: {
  filtered: boolean
  canCreate: boolean
  onClear: () => void
  onAdd: () => void
  onRefresh: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center"
    >
      <span className="grid size-14 place-items-center rounded-xl bg-ink-100 text-ink-400">
        {filtered ? <FileX2 className="size-6" /> : <Inbox className="size-6" />}
      </span>

      <div>
        <h3 className="text-[15.5px] font-semibold text-ink-900">
          {filtered ? 'No requests match these filters' : 'No requests yet'}
        </h3>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-500">
          {filtered
            ? 'Try widening a filter, or clear them all to see the full pipeline.'
            : 'Add the first enquiry and it will appear here at the top of the board.'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {filtered ? (
          <Button variant="secondary" onClick={onClear}>
            Clear all filters
          </Button>
        ) : canCreate ? (
          <Button variant="primary" onClick={onAdd}>
            <Plus />
            Add Request
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
    </motion.div>
  )
}
