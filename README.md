# AWS Distribution — Pipeline Tracker

A multi-company sales pipeline and enquiry tracker. Spreadsheet-speed data entry
with the access control, approval workflow and audit history of an enterprise
application.

---

## Getting started

```bash
npm install
npx prisma migrate deploy     # apply the schema
npm run db:seed               # creates the dropdown types + the admin account
npm run dev                   # http://localhost:3000
```

Sign in with the seeded administrator:

| Field | Value |
| --- | --- |
| Username | `SEED_ADMIN_USERNAME` from `.env` (default `ERP_Admin`) |
| Password | `SEED_ADMIN_PASSWORD` from `.env` |

Sign-in is by **username**, which the administrator sets when creating the
account. Usernames are stored lower-cased, so signing in is case-insensitive.
The email address is contact detail only and is never used to sign in.

Everything else — companies, users, dropdown values, customers and enquiries —
is created from the application screens. The seed deliberately creates no
business data.

### First run

1. Sign in as the seeded administrator.
2. **Admin → Companies → New company.** The company is created with a starter
   set of statuses, locations, materials and probabilities, plus the default
   Status/Probability automation rules. All of it is editable.
3. **Admin → Users** to add supervisors and users, assign them to companies and
   set who each person reports to.
4. **Dropdown settings** to tailor the values and the automation rules.
5. Open the pipeline and start adding requests.

---

## Configuration

All configuration is environment-driven; `.env.example` lists every variable.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SHADOW_DATABASE_URL` | Used only by `prisma migrate dev` |
| `AUTH_SECRET` | Session signing key (`openssl rand -base64 32`) |
| `LOGIN_RATE_LIMIT_MAX` | Failed sign-ins per identifier before throttling |
| `SEED_ADMIN_*` | Bootstrap administrator details |

**Brand assets** are generated from the logo:

```bash
node scripts/build-logo.mjs   # reads public/brand/logo-source.png
```

It separates the orange and navy inks, traces each to vector, and writes
`brand/mark.svg`, a white-wordmark `brand/mark-light.svg` for dark surfaces,
and the favicon set (`favicon.svg` plus 32/180/192px PNGs). Replace
`logo-source.png` and re-run it to rebrand.

**Branding** lives in one file: [`src/lib/branding.ts`](src/lib/branding.ts).
Drop a new logo into `public/brand/` and edit that file to rebrand the whole
application, login screen included. The palette it pairs with is the `@theme`
block at the top of [`src/app/globals.css`](src/app/globals.css).

> Colours are referenced by theme name (`text-negative`, `rounded-md`), never
> as `text-[--color-negative]`. Tailwind v4 compiles the bracket form to
> `color: --color-negative`, which is invalid CSS and silently does nothing.

---

## Architecture

```
src/
  app/
    (auth)/login/              animated sign-in
    (app)/
      select-company/          company picker
      admin/                   global admin (companies, users)
      c/[companyId]/           everything company-scoped
        pipeline/  customers/  delete-requests/  audit/  admin/dropdowns/
    api/
      enquiries/               grid reads
      export/                  Excel
      customers/               customer picker
      companies/[id]/stream/   live updates (SSE)

  components/                  ui/ layout/ pipeline/ admin/ auth/ ...
  lib/
    auth/                      session guards, password hashing, rate limiting
    permissions/               the permission catalogue
    filters/                   the one filtering implementation
    database/                  repositories
    audit/                     structured audit trail
    export/                    workbook generation
    pipeline/                  column metadata, automation engine
    realtime/                  event bus
  server/actions/              server actions, one module per domain
```

### Principles worth knowing before changing anything

**Company access is checked server-side, once, in one place.** Every page,
action and route handler that touches company data goes through
`requireCompanyAccess` in [`src/lib/auth/session.ts`](src/lib/auth/session.ts).
The company id in the URL is an input, never a grant. Frontend filtering is
never treated as security.

**Newest first means highest S.No.** The per-company counter only moves
forward, so a new request always takes the highest S.No and lands on top. The
default order is `serialNo DESC` with `id` as a deterministic tiebreak, so
pagination can never repeat or skip a row.

**There is one filtering implementation.** The grid, the row counts, the summary
figures and the Excel export all build their query through `buildEnquiryWhere`
in [`src/lib/filters/enquiry-filters.ts`](src/lib/filters/enquiry-filters.ts).
That is the reason "export what I am looking at" cannot drift from what is on
screen.

**The 17 columns are declared once.** [`src/lib/pipeline/columns.ts`](src/lib/pipeline/columns.ts)
drives the grid, the per-column filters and the export headers. Adding a column
there gives it a working filter and an export column automatically.

**Permissions are named, not inferred.** Code asks `can(user, 'pipeline:export')`.
There is no `role === 'ADMIN'` branching in feature code, so adding a role or
moving a capability is a one-line change in `lib/permissions`.

**Dropdown values are data.** Status, Location, Material and Probability are
per-company rows an admin manages. Nothing in the application logic depends on a
particular label existing. Values are never hard-deleted — deactivating keeps
every historical record meaningful.

**Deletion is a request, and deletion is soft.** Users raise a request with a
mandatory reason; their supervisor decides. Approval sets `isDeleted` and the
row leaves the grid, search, filters and exports — but stays in PostgreSQL
permanently.

---

## Live updates

The grid does not wait for a refresh. Each company has a Server-Sent Events
channel (`/api/companies/[companyId]/stream`), authorised exactly like any other
company read. Mutations publish to an in-process event bus; the browser
invalidates the affected query and flashes the changed row.

Only change *notifications* travel over the channel — never record contents — so
the client always refetches through the normal authorised query.

The hook keeps **one** `EventSource` per company shared across every component,
reconnects with capped backoff, and is backed up by a slow background refetch
and a refetch on window focus. The header shows Live / Connecting / Offline so
nobody is left guessing.

> Scope: the event bus is per Node process. A multi-instance deployment needs a
> shared broker (Redis pub/sub) behind `lib/realtime/event-bus.ts`. Only
> `publish` and `subscribe` would change.

---

## Automation rules

An admin can link two dropdown fields: *"when Probability is 100%, set Status to
Won"*. Every company starts with that rule and its mirror, plus the Lost/0%
pair — all editable, switchable and removable in **Dropdown settings →
Automation**.

The engine ([`src/lib/pipeline/automation.ts`](src/lib/pipeline/automation.ts))
runs in two places: in the form, so the linked field visibly updates as the user
picks, and again on the server before saving, because the client copy is a
convenience and never the authority. Cascades are bounded and each field is
written at most once per run, so mirrored rules settle instead of looping.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (deployment) |
| `npm run db:seed` | Dropdown types + administrator |
| `npm run db:studio` | Prisma Studio |
| `npx tsx scripts/verify-rules.ts` | 41 business-rule checks against the live schema |
| `node scripts/ui-check.mjs` | Drive the UI in Chromium and report console errors |

`scripts/verify-rules.ts` creates its own throwaway companies and removes them
afterwards, so it is safe to run repeatedly. It covers company isolation,
newest-first ordering, filter combination, soft-delete exclusion, export/grid
parity, the automation engine, filter URL round-tripping and job numbering.

`scripts/ui-check.mjs` drives the real UI in Chromium: it signs in, loads every
screen, opens a column filter and the Add Request drawer, and fails on any
console error, page error or failed request. Screenshots land in `ui-shots/`.

---

## Performance notes

The database is remote (~34ms round trip), so the cost of a screen is dominated
by how many sequential queries it makes. Three things keep that down:

- **Filters never re-render the server.** They are client state mirrored into
  the URL with `history.replaceState`. Routing them through `router.replace`
  would re-run the page's server component - and all its queries - on every
  checkbox, while React Query fetched the same rows anyway.
- **`relationLoadStrategy: 'join'`** on the relation-heavy reads. A pipeline row
  pulls in nine relations; as separate queries that is ~270ms, as one LATERAL
  JOIN it is ~50ms.
- **Every query a screen needs goes out in parallel**, and `loading.tsx` streams
  a skeleton immediately so navigation never feels blocked.

Measured on the production build: pages 80-120ms, a filter change ~100ms.
`npm run dev` is several times slower because it compiles on demand - judge
speed from `npm run build && npm run start`.

---

## Security

- Passwords hashed with bcrypt (12 rounds); plaintext is never stored or logged.
- The login form posts rather than gets, so a submit before hydration cannot
  put a password in the URL, the browser history or the access log.
- Any user can change their own password; doing so revokes their other sessions.
- Sessions are database-backed — an admin deactivating a user, revoking company
  access or resetting a password ends their sessions on the next request rather
  than whenever a token happens to expire.
- Login attempts are throttled per identifier and per IP.
- Every input is parsed with Zod before it reaches the database.
- All database access goes through Prisma's parameterised queries; there is no
  raw SQL.
- A dropdown value or sales owner from another company is rejected server-side,
  so a crafted request cannot pull another tenant's data into a record.
- An unauthorised company id returns "not found" rather than "forbidden", so the
  existence of a company is not disclosed.
- `X-Content-Type-Options`, `X-Frame-Options: DENY`, referrer and permissions
  policies are set for every response.

---

## Deployment notes

- Set `AUTH_SECRET` to a fresh value; never reuse the development one.
- Run `npx prisma migrate deploy`, then `npm run db:seed` once to create the
  administrator, then change that password.
- Serve over HTTPS — session cookies are marked secure in production.
- If a reverse proxy sits in front, disable response buffering for
  `/api/companies/*/stream` (nginx: `proxy_buffering off`). The route already
  sends `X-Accel-Buffering: no`.
- `maxDuration` on the export route is 120s; raise it if exports grow very large.
