# HandyTally — Known Development Issues

A catalog of technical problems in the codebase as of **2026-09-14**, found by reading the repository. Each entry has evidence (file and line), impact, a recommended fix, and status. Issues are numbered `DI-nn` so they can be referenced from tickets and PRs; when one is picked up, add its `HT-n` ticket to the Status column.

Severity scale: **Critical** — data exposure or loss is possible today · **High** — broken or misleading behaviour for users · **Medium** — maintenance risk, will bite soon · **Low** — hygiene.

| ID | Severity | Area | Title | Status |
| --- | --- | --- | --- | --- |
| [DI-01](#di-01) | Critical | Security / RLS | Anonymous callers can read, modify and delete every application table | Fix in [PR #8](https://github.com/HandyTally-Org/HandyTally/pull/8) (HT-14), unmerged |
| [DI-02](#di-02) | Critical | Security / tenancy | Cross-organization access is not enforced; `organization_id` is never set | Open (deferred in HT-14) |
| [DI-03](#di-03) | Critical | Security / functions | `send-invoice` accepts any bearer string — unauthenticated email relay | Open |
| [DI-04](#di-04) | Critical | Secrets | A Nylas API key is committed at `Docs/NylasKey.txt` | Open — rotate |
| [DI-05](#di-05) | High | Config | Supabase URL and anon key hard-coded in `web/lib/supabase.ts` | Open |
| [DI-06](#di-06) | High | Auth | Sign-in depends on a `public.users` table that no migration creates; two conflicting role checks | Open |
| [DI-07](#di-07) | High | Routing | Non-route files under `web/app/` are compiled as routes | Open |
| [DI-08](#di-08) | High | Routing / UI | Navigation links to routes that do not exist (`/calendar`, `/services`) | Open |
| [DI-09](#di-09) | Medium | Code health | Duplicate components and helpers in three locations | Open |
| [DI-10](#di-10) | Medium | Code health | Very large screen files (up to 3,900 lines) with inline data access | Open |
| [DI-11](#di-11) | Medium | Dependencies | Unused packages (Prisma, SendGrid, Express, FullCalendar, …) and floating `latest` versions | Open |
| [DI-12](#di-12) | Medium | Dependencies | `admin-app` is one Expo SDK behind `web` and uses a removed build command | Open |
| [DI-13](#di-13) | Medium | Schema | Misspelled `job_calender_events` table coexists with `job_calendar_events` | Open |
| [DI-14](#di-14) | Medium | Schema | Attachments and photos stored as base64 in Postgres rows | Open — design decision, revisit |
| [DI-15](#di-15) | Medium | Schema | `invoices.status` conflates document type and payment state | Partially mitigated (`sent_at`) |
| [DI-16](#di-16) | Medium | Quality | No meaningful tests, no lint config, no type-check in CI | Open |
| [DI-17](#di-17) | Medium | Functions | `upsert-calendar-event` auth is a header-presence check; stale hosted-project links | Open |
| [DI-18](#di-18) | Low | Code health | `disableRLS()` helper exported from the client | Open |
| [DI-19](#di-19) | Low | Docs | `Docs/context.md` describes a schema and stack that no longer match | Open |
| [DI-20](#di-20) | Low | Hygiene | Expo template leftovers (`(tabs)`, `HelloWave`, `ParallaxScrollView`, `reset-project` script) | Open |
| [DI-21](#di-21) | Low | Hygiene | CORS `Access-Control-Allow-Origin: *` on all edge functions | Open |
| [DI-22](#di-22) | Low | Hygiene | Migration numbering skips from 2025-08 to 2026-09 | Informational |

---

## Security

<a id="di-01"></a>
### DI-01 · Anonymous callers can read, modify and delete every application table

**Severity:** Critical · **Status:** Fix written in [PR #8 — HT-14](https://github.com/HandyTally-Org/HandyTally/pull/8), not yet merged.

**Evidence**

- `supabase/migrations/20250723032713_remote_schema.sql:612-728` — 39 policies of the form `CREATE POLICY "Allow … for authenticated users" ON "public"."<table>" FOR <op> USING (true)` / `WITH CHECK (true)`. No `TO` clause, so they apply to `PUBLIC`, which includes the `anon` role.
- `supabase/migrations/20250808010055_remote_schema.sql:358+` — organization-scoped policies were added later but the loose ones were never dropped (only 11 `drop policy` statements exist across all migrations, none for these).
- Postgres combines permissive policies with OR, so `true OR <org check>` is always `true`.
- The HT-14 migration records a live check on 2026-09-09: `SET ROLE anon; SELECT count(*) FROM public.jobs;` returned every row.

**Impact:** anyone with the anon key — which is in the public JavaScript bundle (see DI-05) — can `SELECT`, `INSERT`, `UPDATE` and `DELETE` clients, jobs, invoices, materials, company data and more across every tenant, without logging in.

**Fix:** merge PR #8. It re-points every `PUBLIC` policy to `authenticated` with `ALTER POLICY`, preserving the conditions, which closes anonymous access without locking out signed-in users. The cross-org half is DI-02.

---

<a id="di-02"></a>
### DI-02 · Cross-organization access is not enforced

**Severity:** Critical (becomes the top issue once DI-01 is merged) · **Status:** Open; explicitly deferred by HT-14.

**Evidence**

- Org-scoped policies exist (`20250808010055_remote_schema.sql`) and match `organization_memberships.organization_id = <table>.organization_id`.
- The web app never reads or writes `organization_id`: `grep -rn organization_id web/app web/components web/lib` returns nothing outside `lib/api.ts` type definitions.
- Per the HT-14 analysis, every existing row has `organization_id IS NULL` and only one `organization_memberships` row exists (the test org).
- Once DI-01 is fixed, the effective policy for a signed-in user is still `true` (from the re-pointed loose policies) — i.e. any authenticated user of any organization can see and edit every organization's data.

**Impact:** tenant isolation, the core promise of the subdomain-per-organization model, does not exist.

**Fix (in order):**

1. Add a `current_organization_id()` SQL helper (from JWT claim or the caller's active membership) and a `BEFORE INSERT` trigger on each tenant table that stamps `organization_id` when null.
2. Make the web app organization-aware: resolve the org from the subdomain at sign-in, store it in `AuthContext`, and pass it on every insert.
3. Backfill `organization_id` on existing rows; create memberships for existing users.
4. Drop the loose policies so only the org-scoped ones remain. Do this last — doing it first hides every row from every user.
5. Add a test that signs in as a user of org A and asserts zero rows from org B.

---

<a id="di-03"></a>
### DI-03 · `send-invoice` does not verify the caller

**Severity:** Critical · **Status:** Open.

**Evidence** — `supabase/functions/send-invoice/index.ts:43-46`:

```ts
const authHeader = req.headers.get("Authorization");
if (!authHeader || !authHeader.startsWith("Bearer ")) {
  return json({ error: "Unauthorized" }, 401);
}
```

Nothing after this line inspects the token. Compare `create-organization/index.ts:33-49`, which calls `supabase.auth.getUser(token)` and then checks the profile.

**Impact:** anyone who can reach the function URL can send arbitrary HTML email from `INVOICE_FROM_ADDRESS` to any address, with the sender's Resend quota and domain reputation. Supabase's gateway does require *an* `apikey` header, but the anon key satisfies it and is public.

**Fix:**

```ts
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
  global: { headers: { Authorization: authHeader } },
});
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) return json({ error: "Unauthorized" }, 401);
```

Then, ideally, accept an `invoice_uid` instead of raw `to`/`html`, load the invoice server-side under the caller's RLS context, and render the HTML in the function. That also removes the "client can email any HTML to anyone" surface.

---

<a id="di-04"></a>
### DI-04 · Nylas API key committed to the repository

**Severity:** Critical · **Status:** Open.

**Evidence:** `git ls-files Docs` lists `Docs/NylasKey.txt` (71 bytes). It has been in history since the file was added.

**Impact:** anyone with read access to the repository or its history holds a live Nylas credential.

**Fix:**

1. Rotate the key in the Nylas dashboard and update the `NYLAS_API_KEY` function secret.
2. `git rm Docs/NylasKey.txt` and commit.
3. Removing it from history (`git filter-repo`) is optional once rotated; rotation is what matters.
4. Add `*.key.txt` / `*Key.txt` to `.gitignore` if that naming is likely to recur, and consider enabling GitHub secret scanning push protection on the org.

---

<a id="di-05"></a>
### DI-05 · Supabase URL and anon key hard-coded in the web client

**Severity:** High · **Status:** Fixed by HT-38 (2026-09-16): `web/lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` with the production values as the fallback, and CI passes repository variables when they are set.

**Evidence** — `web/lib/supabase.ts:6-7`:

```ts
const supabaseUrl = '<production Supabase URL>';
const supabaseAnonKey = '<anon JWT literal>';
```

`admin-app/src/services/supabase.ts` already reads `process.env.EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY`.

**Impact:** the anon key is public by design, so this is not a secret leak — but it means every environment (local, preview, production) points at production, the key cannot be rotated without a code change, and the `.env.example` / CI variables documented in the README are silently ignored by the main app. Note the anon JWT has `exp: 4921443600` (year 2125).

**Fix:** read from `process.env.EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` with a startup assertion that both are set; set them as repository variables for CI. Consider a shorter anon-key expiry when the self-hosted instance's JWT secret is next rotated.

---

## Auth and routing

<a id="di-06"></a>
### DI-06 · Sign-in depends on an undeclared `public.users` table and has two conflicting role checks

**Severity:** High · **Status:** Open.

**Evidence**

- `web/contexts/AuthContext.tsx:47-65` — after password sign-in, selects `role` from `users` where `uid = user.id`; if no row, signs out and throws *"User not authorized"*.
- `web/app/(auth)/login.tsx:58-80` — does the same select but, if no row, **inserts** one with `role: 'user'`.
- `web/app/(app)/users.tsx:159` — also reads `users`.
- No migration or `database/schema.sql` creates `public.users`. The 2025 schema dumps define `user_profiles`, `profiles`, `user_roles` and `organization_memberships` instead.

**Impact:** whether a new user can sign in depends on which code path runs first and on a table that exists only on the live database (schema drift). A fresh environment built from migrations will reject every login. Role is also stored in four places (see `architecture.md` §3.2), so "is this user an admin" has four different answers.

**Fix:** pick `user_profiles` (+ `organization_memberships` for per-org role) as the single source of truth; delete the `users` reads/writes; have one sign-in path in `AuthContext` and make `login.tsx` call it. If `public.users` must stay for now, add a migration that creates it so environments are reproducible.

---

<a id="di-07"></a>
### DI-07 · Non-route files live under `web/app/`

**Severity:** High · **Status:** Open.

**Evidence** — Expo Router treats every file under `app/` as a route. These are not screens:

```
web/app/components/clientform.tsx, CustomCalendar.tsx, InvoiceForm.tsx
web/app/(app)/components/clientform.tsx, CustomCalendar.tsx, WeeklyCalendar.tsx
web/app/lib/api.ts, web/app/(app)/lib/api.ts, web/app/lib/date.ts, web/app/utils/date.ts
web/app/functions/send-calendar-invite.ts
web/app/layout.tsx            (a comment-only file; the real layout is _layout.tsx)
web/app/inventory/page.tsx    (Next.js-style page containing "<h1>Inventory</h1>")
web/app/(tabs)/*              (Expo template)
```

**Impact:** each becomes a navigable URL (e.g. `/components/InvoiceForm`, `/inventory/page`), Expo Router logs "missing default export" warnings for the `.ts` files, and the static export bundles dead pages. `/inventory/page` shadows nothing today but is confusing next to `(app)/inventory`.

**Fix:** move shared code out of `app/` (`web/components`, `web/lib`, `web/utils` already exist for this), delete `layout.tsx`, `inventory/page.tsx` and `(tabs)/`. Combine with DI-09.

---

<a id="di-08"></a>
### DI-08 · Navigation references routes that do not exist

**Severity:** High · **Status:** Open.

**Evidence**

- `web/components/Sidebar.tsx:59` links to `/calendar`; `:103` links to `/services`. Neither `web/app/(app)/calendar.tsx` nor `services.tsx` exists — the calendar screen is `schedule.tsx`. `Sidebar.tsx` is not imported anywhere (`grep -rn "components/Sidebar" web` → nothing), so it is dead code with broken links.
- `web/app/(app)/_layout.tsx:388-394` registers `<Drawer.Screen name="calendar">`, which also has no file; the custom sidebar in the same file correctly uses `/schedule`.

**Impact:** a stray `Drawer.Screen` for a missing route produces a runtime warning and an empty drawer entry on narrow screens; the dead `Sidebar.tsx` will mislead the next person who edits navigation.

**Fix:** delete `components/Sidebar.tsx`; remove or rename the `calendar` drawer entry to `schedule`; add a `services` screen if the service catalog is meant to be editable outside the invoice form.

---

## Code health

<a id="di-09"></a>
### DI-09 · Duplicate components and helpers

**Severity:** Medium · **Status:** Open.

**Evidence**

| Thing | Copies |
| --- | --- |
| Client form | `components/ClientForm.tsx`, `app/components/clientform.tsx`, `app/(app)/components/clientform.tsx` |
| Calendar | `app/components/CustomCalendar.tsx` (693 lines), `app/(app)/components/CustomCalendar.tsx` |
| Invoice form | `components/InvoiceForm.tsx` (1,592 lines), `app/components/InvoiceForm.tsx` |
| API helpers | `lib/api.ts`, `app/lib/api.ts`, `app/(app)/lib/api.ts` |
| Date helpers | `utils/date.ts`, `app/lib/date.ts`, `app/utils/date.ts` |
| Formatting | `utils/format.ts`, `utils/formatting.ts` |

**Impact:** fixes land in one copy and not the others; reviewers cannot tell which is live without tracing imports.

**Fix:** for each row, find the imported copy (`grep -rn "from '.*<name>'" web/app web/components`), delete the rest, and move the survivor out of `app/` (DI-07).

---

<a id="di-10"></a>
### DI-10 · Very large screen files with inline data access

**Severity:** Medium · **Status:** Open.

**Evidence**

```
3,927  web/app/(app)/jobs/[id].tsx
2,155  web/app/(app)/invoices.tsx
1,945  web/app/(app)/jobs.tsx
1,592  web/components/InvoiceForm.tsx
1,571  web/app/(app)/clients.tsx
1,468  web/app/(app)/index.tsx
1,336  web/components/JobForm.tsx
```

Each mixes Supabase queries, state, modals and styles in one component.

**Impact:** slow reviews, merge conflicts on every ticket, and no way to unit-test data logic without rendering the screen.

**Fix:** extract a `services/` (or `lib/queries/`) layer with typed functions (`getJob(uid)`, `saveInvoice(invoice, items)`), and split modals/sections into components. Do it opportunistically per ticket rather than as one big refactor; start with `jobs/[id].tsx`.

---

<a id="di-11"></a>
### DI-11 · Unused and floating dependencies

**Severity:** Medium · **Status:** Open.

**Evidence** — `web/package.json`:

| Package | Finding |
| --- | --- |
| `@prisma/client`, `prisma`, `web/prisma/schema.prisma`, `web/lib/prisma.ts` | `lib/prisma.ts` is imported nowhere; Prisma cannot run in a static Expo bundle |
| `@sendgrid/mail` | Not imported; email goes through Resend in an edge function |
| `express`, `@types/express` | Not imported |
| `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/react`, `react-big-calendar`, `mina-scheduler` | Not imported. Of the four calendar libraries declared, only `@fowusu/calendar-kit` is used |
| `react-native-chart-kit` | Not imported — the dashboard "Sales By Time" section does not use it |
| `react-to-print`, `react-native-webview`, `@shopify/flash-list`, `@react-navigation/native-stack`, `@expo/image-utils`, `@supabase/functions-js` | Not imported |
| `dotenv` | Not needed — Expo loads `.env` itself |
| `expo-constants: "latest"`, `react-native-webview: "latest"` | Floating versions; a fresh `npm install` can pull an SDK-incompatible release |
| `supabase` (CLI) in devDependencies | Fine, but pin it |

(Measured by diffing `package.json` against every `from '…'` import under `web/app`, `web/components`, `web/contexts`, `web/lib`, `web/utils`, `web/hooks`.)

**Impact:** larger bundles and install times; `latest` makes builds non-reproducible and is the most likely cause of a surprise CI build failure.

**Fix:** `npx depcheck` in `web/`, remove what it reports, pin the two `latest` entries to the versions `npx expo install --check` recommends.

---

<a id="di-12"></a>
### DI-12 · `admin-app` lags `web` and uses a removed command

**Severity:** Medium · **Status:** Open.

**Evidence** — `admin-app/package.json`: Expo `~51.0.0`, RN `0.74.5`, React `18.2.0` vs `web` on Expo 52 / RN 0.76 / React 18.3. Script `"build": "expo build:web"` was removed in SDK 46+; the replacement is `npx expo export --platform web`. `"serve": "npx serve web-build"` points at the old output directory.

**Impact:** two toolchains to maintain; `npm run build` fails.

**Fix:** upgrade to SDK 52 (`npx expo install expo@^52 --fix`), change scripts to `expo export --platform web` and `serve dist`. Longer term, consider folding the superuser screens into `web/` behind the `superuser` role and deleting `admin-app`.

---

## Schema

<a id="di-13"></a>
### DI-13 · Misspelled `job_calender_events` coexists with `job_calendar_events`

**Severity:** Medium · **Status:** Open.

**Evidence:** `20250723032713_remote_schema.sql:269` creates `job_calender_events` (with its own sequence and policies); `20250808010055_remote_schema.sql` grants on `job_calendar_events`. Only one `drop policy` touches the misspelled table.

**Fix:** confirm which table the `upsert-calendar-event` function and the schedule screen use, migrate any rows, and drop the other.

---

<a id="di-14"></a>
### DI-14 · Binary data stored as base64 in rows

**Severity:** Medium · **Status:** Open — deliberate for now (see comment in `20260908120000_invoice_item_notes_photos_and_fees.sql`).

**Evidence:** `company_attachments.file_data`, `invoice_items.photos` (`jsonb` array of `{ file_type, file_data }`), `jobs_attachments`.

**Impact:** base64 inflates size by 33%, every `SELECT *` on `invoice_items` drags photos across the wire, PostgREST's 1,000-row / payload limits bite sooner, and backups grow with images. The migration comment explains the reason: the invoice save path deletes and re-inserts items, so a child table keyed by item id would lose rows.

**Fix:** move files to Supabase Storage (`invoices/<uid>/<n>.jpg`) and store the path. Make the items save path an upsert keyed by a stable client-generated `uid` so children survive — that also fixes the reason given for inlining.

---

<a id="di-15"></a>
### DI-15 · `invoices.status` conflates document type and payment state

**Severity:** Medium · **Status:** Partially mitigated by `sent_at` (HT-4).

**Evidence:** values in use — `draft`, `estimate`, `work_order`, `sent`, `partial_paid`, `paid`, `overdue` (`web/components/InvoiceForm.tsx`, `InvoiceDetails.tsx`, `app/(app)/invoices.tsx`). An estimate cannot be "sent" without ceasing to be an estimate, which is why HT-4 added `sent_at`.

**Fix:** split into `document_type` (`estimate` \| `work_order` \| `invoice`) and `payment_status` (`unpaid` \| `partial` \| `paid` \| `overdue`), with a migration that maps existing values and a view that reproduces the old `status` for the UI during transition.

---

## Quality and tooling

<a id="di-16"></a>
### DI-16 · No meaningful tests, no lint config, no type-check in CI

**Severity:** Medium · **Status:** Open.

**Evidence**

- Only test: `web/components/__tests__/ThemedText-test.tsx` (Expo template snapshot).
- `"lint": "expo lint"` but no `.eslintrc*` / `eslint.config.*` in `web/`.
- `tsc` is not run anywhere; many components are untyped (`web/app/(app)/_layout.tsx:240 function NavItem({ icon, label, isActive, onPress, isSubItem = false })`).
- `.github/workflows/ci.yml` runs the static export only.

**Fix:** add `eslint-config-expo`; add `"typecheck": "tsc --noEmit"` and run it in CI with `continue-on-error: true` until the existing errors are burned down, then flip it to required; add tests for pure logic first (`utils/invoiceHtml.ts` totals and fee math, `utils/date.ts`), then RLS tests with `supabase test db`.

---

<a id="di-17"></a>
### DI-17 · `upsert-calendar-event` auth and stale references

**Severity:** Medium · **Status:** Open.

**Evidence**

- `supabase/functions/upsert-calendar-event/index.ts:52-55` checks only that a `Bearer` header exists (same pattern as DI-03). Because it is called by a database webhook, the correct check is a shared secret or the service-role JWT, not a user token.
- `:35-37` comments link to `supabase.com/dashboard/project/evgopevhaapzyvqulwjb/…`, the pre-migration hosted project; the webhook must be recreated on the self-hosted instance and the links updated.
- Creates its Supabase client with the **anon** key (`:31-34`), so any write-back to `jobs` depends on the loose policies from DI-01 and will break when they are tightened.

**Fix:** require `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` (set that as the webhook's header), use the service-role client inside the function, and update the comments.

---

<a id="di-18"></a>
### DI-18 · `disableRLS()` exported from the client

**Severity:** Low · **Status:** Open.

**Evidence:** `web/lib/supabase.ts:55-68` calls `supabase.rpc('disable_rls')`. No migration defines that function, so today it fails harmlessly — but if someone creates it "for testing" it becomes a one-call, client-triggerable way to turn off all row security.

**Fix:** delete the function and the comment.

---

<a id="di-19"></a>
### DI-19 · `Docs/context.md` is out of date

**Severity:** Low · **Status:** Open.

**Evidence:** lists "AI Processing: DeepSeek" (not present in the code), a `users` table with `encrypted_password`, `invoice_services` / `invoice_materials` tables (actual: `invoice_items`), `id` primary keys (actual: `uid`), and no organizations. `Docs/tasks.md` ends with a chatbot prompt.

**Fix:** keep `context.md` as the original product brief but add a banner pointing to `architecture.md` as current; trim the last line of `tasks.md`.

---

<a id="di-20"></a>
### DI-20 · Expo template leftovers

**Severity:** Low · **Status:** Open.

**Evidence:** `web/app/(tabs)/` (template Home/Explore), `components/HelloWave.tsx`, `ParallaxScrollView.tsx`, `Collapsible.tsx`, `ExternalLink.tsx`, `assets/images/react-logo*.png`, `partial-react-logo.png`, `"reset-project": "node ./scripts/reset-project.js"` (script file does not exist), `web/.vscode` committed.

**Fix:** delete; remove the `reset-project` script.

---

<a id="di-21"></a>
### DI-21 · Wildcard CORS on all edge functions

**Severity:** Low · **Status:** Open.

**Evidence:** every function sets `Access-Control-Allow-Origin: *`.

**Impact:** low on its own (the bearer check is what matters), but once DI-03/DI-17 are fixed, restricting origins to `https://*.${BASE_DOMAIN}` removes browser-initiated cross-site calls as a class.

---

<a id="di-22"></a>
### DI-22 · Migration numbering gap

**Severity:** Low · **Status:** Informational.

**Evidence:** `20250808010055_…` is followed by `20260908120000_…`. The timestamps are real dates (the project was dormant between 2025-08 and 2026-09), so ordering is correct — but anyone diffing against a hosted branch should be aware that the self-hosted instance was migrated by dump (`v1.04`), not by these files, and `supabase db push` may report drift. Run `supabase db diff` before the next schema change and commit the result as a baseline.

---

## Suggested order of work

1. **DI-04** rotate the Nylas key (minutes).
2. **DI-01** merge PR #8 (HT-14).
3. **DI-03** and **DI-17** verify tokens in both functions (small, self-contained).
4. **DI-05** env-driven Supabase config; **DI-18** delete `disableRLS`.
5. **DI-06** single source of truth for users/roles — prerequisite for DI-02.
6. **DI-02** organization-aware app + backfill + drop loose policies.
7. **DI-07 / DI-08 / DI-09 / DI-20** one cleanup PR: move files out of `app/`, delete duplicates and template leftovers.
8. **DI-11 / DI-12** dependency pinning and admin-app upgrade.
9. **DI-16** lint + typecheck in CI, first real tests.
10. **DI-13 / DI-14 / DI-15** schema clean-ups as their features are next touched.
