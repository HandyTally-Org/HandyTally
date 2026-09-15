# Changelog

All notable changes to HandyTally are recorded here. Ticket numbers refer to `HT-<n>` issues.

## Unreleased

### Added
- **HT-1** — The user who creates a job is invited to its calendar event alongside the client, so the job shows on their own Google Calendar. `jobs.created_by` records the creator.
- **HT-4** — Send an invoice or estimate to the client by email through the `send-invoice` edge function (Resend). Sends are recorded in a new `invoices.sent_at` column rather than by overwriting `status`, so an estimate stays an estimate after it has been emailed. The provider's rejection reason is surfaced to the user when a send fails.
- **HT-3** — Set a client tag directly from the Clients list.
- Invoice line items support notes and photos; invoices support a fixed or percentage fee applied before tax.
- Invoice editor rebuilt as a Joist-style document layout.

### Changed
- **HT-7** — Jobs status and Clients tag pickers use the same dropdown style as Invoices.
- Invoice HTML generation extracted to `web/utils/invoiceHtml.ts` and shared by preview, print and email.

### Fixed
- **HT-1** — A job with no end date produced a 3.6 second calendar event instead of one hour; deleting a job that was never synced no longer logs a webhook failure.
- **HT-5** — Excel import icon is visible on the Jobs page.
- **HT-4** — Send Invoice dialog renders inside the invoice details modal.
- A blank `uid` is treated as a new invoice rather than an update; company logo query and empty-id saves fixed; Invoices header padding corrected.

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
