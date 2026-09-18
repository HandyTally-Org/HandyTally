# Changelog

All notable changes to HandyTally are recorded here. Ticket numbers refer to `HT-<n>` issues.

## Unreleased

### Changed
- **HT-41** — Release channels. A push to `master` now deploys only `demo.handytally.com` (new Worker `handytally-web-demo`, the `env.demo` block of `web/wrangler.jsonc`). `prod.handytally.com`, the apex and the `*.handytally.com` catch-all are updated by the new `release.yml` workflow when a `vX.Y.Z` tag is pushed, which also publishes a GitHub Release carrying the bundle as `web-dist-vX.Y.Z.tar.gz`. A customer host (`wgelectricus.handytally.com`, `env.wgelectricus`) is updated only by the manual **Promote release to customer** workflow, which deploys that Release asset to the customer's own Worker and refuses a tag newer than prod's. The build is shared (`build-web.yml`) and every bundle carries its version (`EXPO_PUBLIC_APP_VERSION`, `EXPO_PUBLIC_BUILD_SHA`, `dist/release.json`); each deploy verifies the host's `/release.json` before it passes.

### Added
- **HT-68** — Sidebar and detail-rail icons are coloured, one hue per module, matching the DevIssues Category colours. A new **Appearance** block on Admin › Settings, under the navigation editor, lets an organisation admin turn on Dark mode; the choice is stored per organisation in `organization_settings.theme` and re-skins the app for every member on next load. The invoice preview, approval e-mail and printed output stay light in either theme. New migration `20260918120000_organization_theme.sql`.

### Added
- **HT-30 / HT-39** — Password reset works end to end. A **Forgot password?** link on the sign-in screen opens a new reset screen; the email (sent through Resend via the auth service's SMTP) returns to the host the user started from, so a reset begun at a customer subdomain finishes there. The invite link built by `invite-user` only trusts request origins on `*.handytally.com`. Requires the SMTP and redirect-list variables on the self-hosted auth service (see `supabase/config.toml` `[auth]` for the mirrored values).
- **HT-55** — Tenant isolation is enforced in the database. Migration `20260917140000_tenant_scoped_rls.sql` replaces every policy on the organization-scoped tables with one `tenant_scoped` policy: on a customer subdomain only that organization's rows can be read or written; on `handytally.com` a user sees the organizations they belong to and superusers see everything. Anonymous callers no longer see any application data (closes HT-14 / HT-28 / DI-01 and DI-02), and the five organization-stamping triggers that were bound to the wrong tables are rebound.
- **HT-40** — WGElectric starts with an empty organization and `demo.handytally.com` holds the previous data: migration `20260917130000_wgelectric_and_demo_organizations.sql` moves every row that had no organization to the `demo` organization, assigns the company profile and its attachments to `wgelectric`, and sets the five test organizations (`acme-13/14/15`, `acme-demo`, `demo-now`) to inactive so they no longer resolve from a hostname.
- **HT-38** — The subdomain in the address bar selects the organization. On `<customer>.handytally.com` the app resolves the organization before sign-in, shows its name on the login screen, only lets its members in (others are signed out with "You are not a member of …"), stamps new rows with that organization from the request, and shows a "No company found at this address" page for unknown subdomains. `handytally.com`, `www` and `localhost` keep the previous best-membership behaviour. New migration `20260917120000_tenant_from_hostname.sql` (`get_organization_by_subdomain`, header-aware `auto_set_organization_id`).
- **HT-32** — Notes on clients and jobs: a Notes entry under DOCUMENTATION on the client detail and job detail screens lists titled notes, and Add note opens a compact popup with a title and a text box. Notes can be edited and deleted. New `notes` table (`20260916150000_notes.sql`).
- **HT-35** — Jobs can be assigned to an organisation member. An **Assigned to** dropdown on the job form lists the active users of your organisation; the name shows on the Jobs list (sortable, searchable), the job detail Info tab and the Excel export (`assigned_to`, `assigned_to_name`). New `jobs.assigned_to` column.
- **HT-34** — Invoices page exports to Excel (an `Invoices` sheet plus an `Invoice Items` sheet) and imports the `Invoices` sheet back: rows with a `uid` update that invoice, rows with `delete` set to `y` remove it with its line items, and other rows are added.
- **HT-34** — Excel export and import work in the phone app as well as the browser: an export opens the share sheet and an import uses the document picker.
- **HT-1** — **Send calendar invite** button on each job (Jobs list row and job detail) emails the `.ics` for the job's start and finish times on demand, to the client, the job's creator and whoever pressed the button.
- **HT-1** — The user who creates a job is invited to its calendar event alongside the client, so the job shows on their own Google Calendar. `jobs.created_by` records the creator.
- **HT-4** — Send an invoice or estimate to the client by email through the `send-invoice` edge function (Resend). Sends are recorded in a new `invoices.sent_at` column rather than by overwriting `status`, so an estimate stays an estimate after it has been emailed. The provider's rejection reason is surfaced to the user when a send fails.
- **HT-3** — Set a client tag directly from the Clients list.
- Invoice line items support notes and photos; invoices support a fixed or percentage fee applied before tax.
- Invoice editor rebuilt as a Joist-style document layout.

### Changed
- **HT-31** — The web app is deployed to Cloudflare Workers (static assets) by CI on every push to `master` instead of by Vercel. `create-organization` now only validates the subdomain and inserts the organization as `active`; the Route 53 and Vercel provisioning code, its secrets (`AWS_*`, `VERCEL_*`, `GITHUB_*`) and `EXPO_PUBLIC_VERCEL_TEAM_ID` are gone, and the admin app shows the tenant URL instead of Vercel links.
- New Job (Jobs list and Schedule) and New Client open in the same compact centred dialog as the material and labor forms, with Cancel and the primary button in the dialog footer, instead of a full-width form below the list or a full-height modal. Editing a client from the list uses the same dialog.
- **HT-23** — Add and edit forms on the Inventory and Labor pages open in a compact centred dialog with a shared header, two-column layout and footer instead of a full-width popup. Labor gains an edit dialog; its pencil icon previously did nothing.
- **HT-34** — The five list pages share one Excel helper (`web/utils/excel.ts`) and one pair of export/import buttons with hover labels, replacing five copies of the file-reader and hidden-input code.
- **HT-1** — Calendar invites are now iCalendar attachments emailed through Resend instead of events created on a Nylas calendar. Updates resend the same event; deletes send a cancellation. The `NYLAS_*` secrets are no longer used and the Nylas subscription can be dropped.
- **HT-7** — Jobs status and Clients tag pickers use the same dropdown style as Invoices.
- Invoice HTML generation extracted to `web/utils/invoiceHtml.ts` and shared by preview, print and email.

### Fixed
- A signed-in user who lands on the login page (reload, back button, or an old cached bundle) is taken into the app instead of being shown the login form again.
- Signing in reliably opens the app. The login screen navigated before the auth context had heard about the new session, so the app layout bounced the visitor straight back to the login page whenever the async auth event lost the race; the session is now set from the sign-in response itself.
- **HT-55** — The Clients, Jobs, client detail, company settings and sidebar screens used their own Supabase client (`web/lib/api.ts` and two copies under `web/app/`) instead of the shared one, so their requests carried no tenant and bypassed the per-organization scoping; they now share the single client. Rows a superuser creates on `handytally.com` are stamped with their own organization instead of none, and the tenant lookup no longer errors on a request with no tenant header (`20260917150000_tenant_header_hardening.sql`). `handytally.com` and `www` no longer serve the app: they show where to sign in (your company's subdomain, or the demo) and the app runs only on customer hosts.
- **HT-34** — Importing a Labor export failed for every row because the blank `unit` text was sent to a numeric column; the value is now parsed as a number and left out when blank.
- **HT-23** — Typing a unit such as "hour" when adding a labor code could never save (numeric column), so the field is no longer offered.
- Inventory and Labor no longer call a database function (`execute_sql`) that does not exist, on every page load and import.
- **HT-1** — A job with no end date produced a 3.6 second calendar event instead of one hour; deleting a job that was never synced no longer logs a webhook failure.
- **HT-5** — Excel import icon is visible on the Jobs page.
- **HT-4** — Send Invoice dialog renders inside the invoice details modal.
- A blank `uid` is treated as a new invoice rather than an update; company logo query and empty-id saves fixed; Invoices header padding corrected.

### Removed
- **HT-31** — `web/amplify.yml`; AWS Amplify no longer serves the app.
- Deleted the unused `web/components/MaterialsPage.tsx`; the Excel export/import and material list it duplicated live in `web/app/(app)/inventory.tsx`.

## 1.04 — 2025-12-15
- Migrated to a self-hosted Supabase instance.

## 2025-08
- Admin app: fixed re-render on input, unblocked adding the first superuser.
- Supabase migrations consolidated; `on-job-update` function removed in favour of the database webhook.

## 2025-07
- Admin app first draft with the `create-organization` edge function provisioning per-tenant subdomains (Route 53 + Vercel).
- Web app moved under `web/`; unused files removed.

## 2025-06
- Calendar invites on job creation and update via Nylas (`upsert-calendar-event`), with `.ics` delivery and stored `calendar_event_id` for deletion.
- Initial migration added to enable Supabase branching.

## 1.03 — 2025-03-27
## 1.02 — 2025-03-10
## 1.01 — 2025-03-05
## 1.0 — 2025-02-28
- Initial release: clients, jobs, invoices, inventory, labor, dashboard, admin user and company management; AWS Amplify deployment.
