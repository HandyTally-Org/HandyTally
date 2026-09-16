# HandyTally — Architecture

Detailed technical breakdown of the system as it exists in the repository today. For the short version see the [root README](../README.md); for known problems see [dev-issues.md](dev-issues.md).

- [1. System overview](#1-system-overview)
- [2. Client applications](#2-client-applications)
- [3. Authentication and authorization](#3-authentication-and-authorization)
- [4. Multi-tenancy](#4-multi-tenancy)
- [5. Data model](#5-data-model)
- [6. Edge functions](#6-edge-functions)
- [7. Key flows](#7-key-flows)
- [8. Build and deployment](#8-build-and-deployment)
- [9. Environments and secrets](#9-environments-and-secrets)
- [10. Testing and quality gates](#10-testing-and-quality-gates)

---

## 1. System overview

HandyTally is a **thick-client** application. There is no application server: the React Native / Expo client talks directly to Postgres through Supabase's PostgREST API using `@supabase/supabase-js`, and the database enforces authorization with row-level security (RLS). Server-side code exists only as three Deno edge functions, each wrapping a third-party service that needs a secret.

```
┌──────────────────────────┐      ┌──────────────────────────┐
│  web/  (Expo Router)     │      │  admin-app/  (Expo)      │
│  tenant-facing app       │      │  superuser console       │
└────────────┬─────────────┘      └────────────┬─────────────┘
             │ supabase-js (anon key + user JWT)│
             ▼                                  ▼
┌───────────────────────────────────────────────────────────┐
│  Supabase (self-hosted)                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐ │
│  │ Auth     │  │ Postgres │  │ Edge Functions (Deno)    │ │
│  │ GoTrue   │  │ + RLS    │  │  send-invoice   → Resend │ │
│  └──────────┘  └────┬─────┘  │  upsert-calendar-event   │ │
│                     │ webhook│      → Resend (.ics)      │ │
│                     └───────►│  create-organization     │ │
│                              │     → organizations row  │ │
│                              └──────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

Consequences of this shape:

- Every table the client reads must have RLS policies that are correct **for the anon key**, because the anon key ships in the JavaScript bundle and is public by construction.
- Business rules that must not be bypassed (tenant isolation, role checks) have to live in policies, `SECURITY DEFINER` functions or edge functions — never only in the client.
- The client is large: ~27k lines of TSX under `web/app` and `web/components`, because all data shaping happens there.

## 2. Client applications

### 2.1 `web/` — the HandyTally app

| | |
| --- | --- |
| Framework | Expo SDK 52, React Native 0.76, React 18.3, Expo Router 4 (file-based routing), React Native Paper 5 |
| Targets | Web (primary, static export served by a Cloudflare Worker), iOS, Android |
| Entry | `expo-router/entry` → `app/_layout.tsx` |
| State | React context (`contexts/AuthContext.tsx`) + local component state; no global store |
| Data | `lib/supabase.ts` client; ad-hoc queries inside screens; helpers in `lib/api.ts` |

**Route groups**

| Path | Screen | Notes |
| --- | --- | --- |
| `(auth)/login`, `(auth)/signup` | Sign in / sign up | Email + password via Supabase Auth |
| `(app)/index` | Dashboard | Counts, sales-by-time section, recent activity |
| `(app)/clients`, `clients/[id]` | Clients | List with tag picker; detail with jobs and invoices |
| `(app)/jobs`, `jobs/[id]` | Jobs | List with Excel import/export (SheetJS); detail with costs, attachments, invoices |
| `(app)/invoices`, `invoices/form`, `invoices/[id]/edit` | Invoices & estimates | Document editor (`components/InvoiceForm.tsx`), details modal (`components/InvoiceDetails.tsx`) |
| `(app)/inventory` | Materials | Stock levels, low-stock threshold |
| `(app)/labor` | Labor | Labor entries per job |
| `(app)/schedule` | Calendar | `@fowusu/calendar-kit`; `WeeklyCalendar.tsx`, `CustomCalendar.tsx` |
| `(app)/admin/company`, `admin/users` | Admin | Company profile + logo; user management via `auth.users` RPCs |

`(app)/_layout.tsx` renders the navigation (sidebar on wide screens, drawer on narrow) and wraps everything in the authenticated shell.

**Shared modules**

- `utils/invoiceHtml.ts` — `generateInvoiceHTML(invoice, items, companyInfo)`; the one source of the invoice document used for on-screen preview, `expo-print` / `react-to-print`, and the body of the email sent by `send-invoice`.
- `utils/format.ts`, `utils/formatting.ts`, `utils/date.ts` — money and date helpers.
- `styles.ts`, `styles/global.css`, `styles/print.css` — shared styling; `print.css` hides chrome when printing an invoice.
- `lib/customStorage.ts` — no-op storage used for the Supabase client during static export (no `window`).

### 2.2 `admin-app/` — superuser console

| | |
| --- | --- |
| Framework | Expo SDK 51, React Native 0.74, React Navigation 6 (stack + bottom tabs) |
| Screens | Login, Dashboard (counts), Organizations (create), Users (list / create / edit) |
| Data | `src/services/supabase.ts` (reads `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY`), hooks in `src/hooks/` |
| Privileged work | Delegated to the `create-organization` edge function; the app never holds the service-role key |

Only a user whose `user_profiles.role = 'superuser'` and `is_active = true` gets past `useAuth`.

## 3. Authentication and authorization

### 3.1 Sign-in

1. `supabase.auth.signInWithPassword` (GoTrue) issues a JWT.
2. `AuthContext.signIn` then reads `public.users` (`uid = auth.uid()`) to fetch a `role`; if no row exists the session is signed out with *"User not authorized"*. `(auth)/login.tsx` has a second copy of this logic that instead **inserts** a `users` row with `role: 'user'` when none exists. See [DI-06](dev-issues.md#di-06).
3. The session is persisted by supabase-js (`persistSession: true`); `AuthContext` subscribes to `onAuthStateChange`.

### 3.2 Roles

Roles are stored in more than one place, which is historical:

| Store | Column | Used by |
| --- | --- | --- |
| `public.user_profiles` | `role user_role`, `is_active` | `is_superuser()` helper, `create-organization`, admin-app |
| `public.organization_memberships` | `role user_role` | Org-scoped RLS policies |
| `public.users` | `role text` | `AuthContext`, `login.tsx`, `(app)/users.tsx` — table is **not in the migrations** |
| `auth.users.raw_user_meta_data.role` | — | `database/auth_functions.sql` `is_admin()` |

`user_role` is a Postgres enum: `user`, `admin`, `superuser`.

### 3.3 Row-level security

RLS is enabled on every application table. Two generations of policies coexist:

1. **2025-07-23** — one policy per operation per table, all `USING (true)` / `WITH CHECK (true)`, granted to `PUBLIC` (which includes `anon`).
2. **2025-08-08** — `"Users can access <table> in their organizations"` policies, `FOR ALL TO authenticated`, that check `is_superuser()` or an active `organization_memberships` row matching the row's `organization_id`.

Postgres ORs permissive policies together, so generation 1 makes generation 2 inert. Closing this is [HT-14 / PR #8](https://github.com/HandyTally-Org/HandyTally/pull/8); see [DI-01](dev-issues.md#di-01).

### 3.4 Admin RPCs

`database/auth_functions.sql` defines `SECURITY DEFINER` functions (`get_all_users`, `admin_update_user_metadata`, `admin_update_user_email`, `admin_update_user_password`, `admin_delete_user`, `admin_confirm_user`) that read and write `auth.users` on behalf of an admin. Each checks `is_admin()` first. They are applied by hand in the SQL editor, not by migration.

## 4. Multi-tenancy

- `organizations` holds one row per tenant with a unique `subdomain`.
- `organization_memberships` links users to organizations with a role and `is_active`.
- `clients`, `jobs`, `jobs_attachments`, `invoices`, `company`, … carry a nullable `organization_id` (added 2025-08-08, indexed).
- `create-organization` creates the tenant: validates the subdomain (3–63 chars, `[a-z0-9-]`, not in a reserved list, unique) and inserts the row with `domain = <sub>.<BASE_DOMAIN>` and `status = active`. Hosting needs nothing per tenant: the Cloudflare Worker serves every `*.handytally.com` host from the one bundle (HT-37).
- **The hostname picks the tenant (HT-38).** `web/lib/tenant.ts` reads the first-level subdomain of `EXPO_PUBLIC_BASE_DOMAIN` from `window.location`; `AuthContext` resolves it with `get_organization_by_subdomain()` (SECURITY DEFINER, callable by anon, active rows only) before sign-in, and a signed-in user must hold an active membership of that organisation or is signed out with a message. An unknown subdomain renders `TenantGate`'s "No company found at this address" page. The apex, `www`, `localhost` and the `workers.dev` URL carry no tenant and fall back to the user's best membership.
- **New rows are stamped from the request.** `web/lib/supabase.ts` sends the subdomain as the `x-tenant-subdomain` header; `auto_set_organization_id()` reads it through PostgREST's `request.headers` setting and stamps that organisation after checking membership. Precedence: a value already on the row (if the caller may use it) > the request's tenant > best membership. No insert site needed changing.

**Current state:** the app now selects and stamps the organisation per host, but reads are not yet filtered by `organization_id` and, per the HT-14 analysis, existing rows have `organization_id = NULL` (HT-40 moves them to a `demo` organisation). Tenant isolation holds only once the wide `authenticated` policies are replaced by the org-scoped ones. See [DI-02](dev-issues.md#di-02).

## 5. Data model

Authoritative source: `supabase/migrations/`. The 2025 files are dumps of the hosted project; the 2026 files are hand-written. Application tables use `uid uuid` as their primary key (not `id`).

### 5.1 Tenancy and users

| Table | Key columns |
| --- | --- |
| `organizations` | `id`, `name`, `subdomain` (unique), timestamps |
| `organization_memberships` | `user_id`, `organization_id`, `role user_role`, `is_active` |
| `user_profiles` | `id` (= `auth.users.id`), `role user_role`, `is_active` |
| `profiles` | Legacy per-user profile |
| `user_roles` | Legacy role table |
| `audit_log` | Change log |

### 5.2 Company

| Table | Key columns |
| --- | --- |
| `company` | Name, address, contact, tax settings, `organization_id` |
| `company_attachments` | Logo etc. as `file_type` + base64 `file_data` |
| `email_integrations` | Per-org outbound mail settings |

### 5.3 Operations

| Table | Key columns |
| --- | --- |
| `clients` | Contact fields, `tag`, `organization_id` |
| `jobs` | `client_id`, `name`, dates, `status`, `notes`, `total`, `calendar_event_id`, `organization_id`, `created_by` (who made it), `assigned_to` (who does it, HT-35) |
| `job_costs` | Cost lines per job |
| `jobs_attachments` | Files per job, `organization_id` |
| `job_calendar_events` | Mirror of the Nylas event per job (`job_calender_events` is a misspelled predecessor still present) |
| `materials` | Inventory: `unit_price`, `quantity_in_stock`, `min_stock_level` |
| `services` | Catalog: `rate`, `unit`, `category` |

### 5.4 Documents

| Table | Key columns |
| --- | --- |
| `invoices` | `uid` (PK), `invoice_number`, `client_id`, `job_id`, `user_id`, `issue_date`, `due_date`, `status`, `subtotal`, `tax_rate`, `tax_amount`, `total`, `fee_type` (`fixed` or `percent`), `fee_value`, `fee_amount`, `sent_at`, `notes`, `organization_id` |
| `invoice_items` | `invoice_id`, description, `quantity`, `rate`, `total`, `notes`, `photos jsonb` |

**Invoice `status`** doubles as document type and payment state: `draft`, `estimate`, `work_order`, `sent`, `partial_paid`, `paid`, `overdue`. Because of that, "has it been emailed" is tracked separately in `sent_at` (migration `20260909120000`).

**Fees** are applied before tax: `fee_amount = fee_type == 'percent' ? subtotal * fee_value / 100 : fee_value`; `total = (subtotal + fee_amount) * (1 + tax_rate)`.

**Photos** are stored inline on the item as `[{ file_type, file_data }]` (base64). The save path for items is delete-and-reinsert, which is why a child table was not used (migration `20260908120000`).

## 6. Edge functions

All three live under `supabase/functions/<name>/index.ts`, use `serve` from `std@0.168.0`, answer `OPTIONS` with `Access-Control-Allow-Origin: *`, and accept only `POST`.

### `send-invoice`

- **Caller:** `components/InvoiceDetails.tsx` → `supabase.functions.invoke('send-invoice', { body })`.
- **Body:** `{ to, subject, html, attachments?: [{ filename, content }] }`. `html` is the output of `generateInvoiceHTML`.
- **Does:** POSTs to Resend with `from = INVOICE_FROM_ADDRESS`, optional `reply_to`. On success the client sets `invoices.sent_at = now()`. On failure the provider's error message is returned to the user.
- **Auth:** requires an `Authorization: Bearer …` header **but does not validate it** — see [DI-03](dev-issues.md#di-03).

### `upsert-calendar-event`

- **Caller:** Supabase **database webhook** on `public.jobs` (INSERT / UPDATE / DELETE).
- **Does:** builds an iCalendar invitation for the job and emails it through Resend to the client and the job's creator (`jobs.created_by` → `auth.users.email`), so the job lands on both calendars (HT-1). Updates resend the same UID (`job-<uid>@handytally`, stored in `jobs.calendar_event_id`) with a higher `SEQUENCE`; deletes send `METHOD:CANCEL`. No calendar API is involved.
- **Auth:** checks for a bearer header and `Content-Type: application/json`.

### `create-organization`

- **Caller:** admin-app `src/services/organizations.ts`.
- **Body:** `{ name, subdomain }`.
- **Does:** verifies the JWT with `supabase.auth.getUser(token)` using a **service-role** client, requires `user_profiles.role = 'superuser'` and `is_active`, validates and reserves the subdomain and inserts the organization as `active`. Returns `{ success, organization, domain }`. No DNS or hosting call is made (HT-31).

## 7. Key flows

### 7.1 Create → send an invoice

```
InvoiceForm (client)                 Postgres                     send-invoice           Resend
     │ save                              │                              │                   │
     ├─ upsert invoices ────────────────►│                              │                   │
     ├─ delete invoice_items ───────────►│                              │                   │
     ├─ insert invoice_items ───────────►│                              │                   │
     │                                   │                              │                   │
InvoiceDetails                          │                              │                   │
     │ Send                              │                              │                   │
     ├─ generateInvoiceHTML()            │                              │                   │
     ├─ functions.invoke ───────────────────────────────────────────────►│                   │
     │                                   │                              ├─ POST /emails ───►│
     │◄────────────────────────────────────────────────────────────────┤ 200 | {error}     │
     ├─ update invoices.sent_at ────────►│                              │                   │
```

### 7.2 Job → calendar

```
JobForm ─ insert/update jobs ─► Postgres ─ webhook ─► upsert-calendar-event ─► Resend (.ics to client + creator)
                                                              │
                                                              └─ update jobs.calendar_event_id
```

### 7.3 New tenant

```
admin-app ─ invoke ─► create-organization ─┬─ verify superuser
                                           ├─ validate subdomain
                                           └─ insert organizations (domain, status = active)

browser ─ https://<sub>.handytally.com ─► Cloudflare wildcard route ─► handytally-web Worker (same bundle)
```

## 8. Build and deployment

| Component | How |
| --- | --- |
| Web app | `.github/workflows/ci.yml` on push to `master`: `npm ci` → `npx expo export --platform web` → `wrangler deploy`. `web/wrangler.jsonc` defines an assets-only Cloudflare Worker (`handytally-web`) that serves `dist/` with `not_found_handling: single-page-application`, because Expo emits `jobs/[id].html` for dynamic routes and deep links must fall back to `index.html`. `app.json` sets `web.output = "static"` and Metro as the bundler. |
| CI | The same workflow runs the export on every PR and uploads `dist/` as an artifact; the deploy job is skipped for PRs. |
| Database | `supabase db push` against the linked self-hosted project. |
| Edge functions | `supabase functions deploy <name>`; secrets via `supabase secrets set`. |
| Admin app | No pipeline; run locally with `npx expo start --web`. |
| Native builds | Not configured (no EAS profile in the repo). |

## 9. Environments and secrets

| Where | What |
| --- | --- |
| GitHub Actions variables | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BASE_DOMAIN` (build) |
| GitHub Actions secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (deploy) |
| Supabase function secrets | `RESEND_API_KEY`, `INVOICE_FROM_ADDRESS`, `INVOICE_REPLY_TO`, `CALENDAR_FROM_ADDRESS`, `BASE_DOMAIN` |
| Auto-injected into functions | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Local | `web/.env`, `admin-app/.env`, `supabase/functions/.env` (templates committed as `.env.example`) |

`web/lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_BASE_DOMAIN`, falling back to the production values (public by construction) when unset — DI-05 closed by HT-38.

## 10. Testing and quality gates

- **Unit tests:** Jest via `jest-expo`. The only test is the Expo template's `ThemedText` snapshot.
- **Lint:** `expo lint` is wired in `package.json` but no ESLint config exists in the repo.
- **Type checking:** TypeScript is present but not run in CI; many components are untyped (`function NavItem({ icon, label, … })`).
- **CI:** web static export only.

See [dev-issues.md](dev-issues.md) §"Quality" for the plan to improve this.
