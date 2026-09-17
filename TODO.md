# Implementation checklist

Status of the Pipeline / Enquiry Tracking System build.

## Foundation

- [x] Next.js 15 (App Router) + TypeScript + Tailwind v4 project scaffold
- [x] PostgreSQL 16 database `pipeline_mep` created on the internal database server
- [x] Dedicated `pipeline_app` role — no shared credentials, no access to `aws_prod`
- [x] Prisma schema: 13 models, foreign keys, composite indexes, `DECIMAL(16,2)` currency
- [x] Migrations applied (`init`, `add_customers`, `add_automation_rules`, `add_username`)
- [x] All secrets in `.env` (git-ignored); `.env.example` documents every variable

## Authentication and authorisation

- [x] Auth.js v5 credentials provider, bcrypt (12 rounds) — no plaintext passwords
- [x] Sign in by username, set by the administrator when creating the account
- [x] Database-backed sessions: deactivating a user revokes access on the next request
- [x] Login rate limiting per identifier *and* per IP, backed by `login_attempts`
- [x] Constant-time-ish failure path so timing does not reveal which accounts exist
- [x] `middleware.ts` edge gate + real authorisation in `lib/auth/session.ts`
- [x] Centralised permission catalogue (`lib/permissions`) — no `role === 'ADMIN'` in feature code
- [x] `requireCompanyAccess` on **every** company-scoped read and write
- [x] Security headers (`nosniff`, `DENY`, referrer policy, permissions policy)

## Screens

- [x] Branding driven by the real logo: navy #302078 / orange #E8681A palette,
      transparent mark plus a light variant for dark surfaces
- [x] Animated login (aurora gradients, panning grid, logo reveal, branded hand-off)
- [x] Company selection with animated cards + single-company fast path
- [x] Application shell: top-bar navigation, company switcher, live indicator
- [x] Pipeline data grid — all 17 columns, pinned S.No/Job No, sticky header
- [x] Add / Edit request drawer with inline customer creation
- [x] Delete request dialog (mandatory reason)
- [x] Delete request approval board (approve / reject with note)
- [x] Audit timeline with before → after field diffs
- [x] Customer directory
- [x] Admin: companies
- [x] Admin: users, company assignment, supervisor assignment, password reset
- [x] Admin: dropdown values (colour, order, activate/deactivate)
- [x] Customers can be edited; renaming updates every request that uses them
- [x] Display codes are generated from the name, not typed
- [x] Any user can change their own password (other sessions are revoked)
- [x] Admin: automation rules (Status ↔ Probability linkage)

## Pipeline behaviour

- [x] All 17 business columns on one screen, in the agreed order
- [x] Navigation in the top bar, no sidebar — the grid gets the full window width
- [x] Newest first, ordered by S.No descending (the counter only moves forward,
      so a new request always takes the highest S.No)
- [x] Per-column filters matched to each data type
- [x] Multiple filters combine with AND; multi-select within a column is OR
- [x] Active filter chips, per-column clear, clear-all
- [x] Filters live in the URL — shareable, survive refresh, reused by the export
- [x] Debounced global search
- [x] Date filters offer Today / This month / Last 30 days and other presets
- [x] Filters never re-render the server - client state mirrored into the URL
- [x] Server-side filtering, sorting and pagination
- [x] Summary strip: pipeline value and row count over the **whole** filtered set
- [x] Row hover, selected row, truncation tooltips, polished scrollbars
- [x] Skeleton, empty, filtered-empty and error states

## Live data

- [x] Server-Sent Events channel per company, authorised like any other read
- [x] One shared `EventSource` per company across all components
- [x] Automatic reconnect with capped exponential backoff
- [x] Query invalidation on push; new/changed rows flash briefly
- [x] Slow background refetch + refetch on focus as the fallback
- [x] Visible Live / Connecting / Offline indicator

## Workflow

- [x] Users cannot delete records directly
- [x] Deletion request with mandatory reason (minimum 10 characters)
- [x] Routed to the requester's supervisor; falls back to the admin queue
- [x] Nobody can approve their own request, including admins
- [x] Approval performs a **soft delete** only — record stays in PostgreSQL
- [x] Soft-deleted rows excluded from the grid, search, filters and export
- [x] Admin restore path
- [x] Requester can withdraw a pending request

## Excel export

- [x] Exports the complete filtered result set, not the loaded page
- [x] Runs the identical `buildEnquiryWhere` predicate as the grid
- [x] Scoped to the selected company; excludes deleted records
- [x] Bold header, frozen header row + pinned first two columns, auto-filters
- [x] Real date cells, numeric currency, percentage cells for probability
- [x] `CompanyName_Pipeline[_Filtered]_YYYY-MM-DD.xlsx`
- [x] Second sheet recording who exported what, when, and under which filters
- [x] Keyset-streamed in batches so large exports do not exhaust memory
- [x] Export recorded in the audit trail

## Audit

- [x] Structured entries: action, entity, actor, company, pre-rendered summary
- [x] Field-level `changes` diff (label, from, to) rather than prose
- [x] Covers create, edit, deletion request/approve/reject/restore, dropdown and
      automation changes, user and company administration, exports
- [x] Auditing failures never break the operation being recorded
- [x] Filterable timeline by action and by actor

## Verification

- [x] `npx tsc --noEmit` clean
- [x] `npm run build` succeeds
- [x] `npx tsx scripts/verify-rules.ts` — 41/41 business-rule checks pass
- [x] `node scripts/ui-check.mjs` — every screen driven in Chromium, no console errors
- [x] Excel workbook inspected: 17 headers in order, frozen panes, autofilter
- [x] Every route smoke-tested as an authenticated admin

## Fixed after first review

- [x] **Tailwind v4 token syntax.** `text-[--color-negative]` compiled to the
      invalid `color: --color-negative`, so every custom colour, radius, shadow
      and easing was silently dropped. 210 references rewritten to the v4 theme
      utilities; error text is red again.
- [x] **Nested `<button>` in the filter menus** broke hydration on the pipeline.
- [x] **Password could reach the URL.** The login form fell back to a native GET
      submit before hydration; it is now `method="post"` with the button
      disabled until React takes over.
- [x] **Date presets shifted a day** east of UTC ("1 Sep" rendering as "31 Aug").
- [x] **Optional pickers rejected `null`** with a bare "Invalid input", which is
      what blocked user creation.
- [x] Browser `confirm()` replaced with an in-app dialog.
- [x] Form failures now show a summary banner naming the field.

## Deployment

- [x] Served at `https://ralsnahashho.dyndns.org:1000/awsmepplms`, behind the
      existing nginx edge, alongside the applications already on port 1000
- [x] Multi-stage Dockerfile on Next's `standalone` output; no source and no
      build toolchain in the shipped layer
- [x] Its own compose project on the shared `aws-app_aws-app` network, so the
      infrastructure-managed `docker-compose.app.yml` is left untouched
- [x] Database confirmed to be the PostgreSQL cluster on AWS-Data - same
      `system_identifier` through both addresses - reached at `172.30.0.20:5432`
- [x] Base path compiled into the image and passed through by nginx unchanged;
      `withBasePath()` covers the URLs Next does not rewrite
- [x] SSE stream exempted from proxy buffering and from the 120s read timeout
- [x] Container publishes no host port, so the TLS edge cannot be bypassed
- [x] `node scripts/deploy/push.mjs` is repeatable and idempotent; see
      `docs/deployment.md`
- [ ] Rotate the `pipeline_app` database password before go-live - it was set
      during development and has been used from a workstation
- [ ] Clear the development and QA records from the database before handover

## Known gaps / next steps

- [x] Brand assets traced to SVG per colour, so the mark is crisp at any size
      and carries no white fringe
- [x] Tab icon is the company logo (SVG + 32/180/192px PNG fallbacks)
- [x] Browser QA via `scripts/ui-check.mjs` — every screen driven in Chromium,
      zero console errors; screenshots reviewed
- [ ] Admin screen for browsing and restoring soft-deleted records (the server
      action `restoreEnquiryAction` exists; there is no UI for it yet)
- [ ] Row virtualisation in the grid. Server-side pagination caps a page at 200
      rows, so this only matters if page sizes are raised.
- [ ] Multi-instance deployment would need Redis pub/sub behind
      `lib/realtime/event-bus.ts` in place of the in-process emitter
- [ ] Dark mode. Tokens are structured for it; no palette defined yet.
- [ ] Automated test suite (the verification script is a script, not a runner)
- [ ] Email notification when a deletion request is raised or decided
- [ ] `package.json#prisma` seed config is deprecated in favour of
      `prisma.config.ts` before a Prisma 7 upgrade
