# Changelog

All notable changes to HandyTally are recorded here. Ticket numbers refer to `HT-<n>` issues.

## Unreleased

### Added
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
- New Job (Jobs list and Schedule) and New Client open in the same compact centred dialog as the material and labor forms, with Cancel and the primary button in the dialog footer, instead of a full-width form below the list or a full-height modal. Editing a client from the list uses the same dialog.
- **HT-23** — Add and edit forms on the Inventory and Labor pages open in a compact centred dialog with a shared header, two-column layout and footer instead of a full-width popup. Labor gains an edit dialog; its pencil icon previously did nothing.
- **HT-34** — The five list pages share one Excel helper (`web/utils/excel.ts`) and one pair of export/import buttons with hover labels, replacing five copies of the file-reader and hidden-input code.
- **HT-1** — Calendar invites are now iCalendar attachments emailed through Resend instead of events created on a Nylas calendar. Updates resend the same event; deletes send a cancellation. The `NYLAS_*` secrets are no longer used and the Nylas subscription can be dropped.
- **HT-7** — Jobs status and Clients tag pickers use the same dropdown style as Invoices.
- Invoice HTML generation extracted to `web/utils/invoiceHtml.ts` and shared by preview, print and email.

### Fixed
- **HT-34** — Importing a Labor export failed for every row because the blank `unit` text was sent to a numeric column; the value is now parsed as a number and left out when blank.
- **HT-23** — Typing a unit such as "hour" when adding a labor code could never save (numeric column), so the field is no longer offered.
- Inventory and Labor no longer call a database function (`execute_sql`) that does not exist, on every page load and import.
- **HT-1** — A job with no end date produced a 3.6 second calendar event instead of one hour; deleting a job that was never synced no longer logs a webhook failure.
- **HT-5** — Excel import icon is visible on the Jobs page.
- **HT-4** — Send Invoice dialog renders inside the invoice details modal.
- A blank `uid` is treated as a new invoice rather than an update; company logo query and empty-id saves fixed; Invoices header padding corrected.

### Removed
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
