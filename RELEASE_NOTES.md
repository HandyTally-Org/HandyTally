# HandyTally release notes

What changed for you in each version of HandyTally, in plain language. The
technical record with ticket numbers is [CHANGELOG.md](CHANGELOG.md).

Each release is one `## vX.Y.Z — date` section, newest first. The app shows
the section for the version a site is running at `/whats-new`, and the
version itself is in the sidebar footer. To edit: change this file, run
`npm run release-notes` in `web/`, and commit both files.

## v2.0.0

### QuickBooks Online export

- A new **Admin › Export** page writes files that QuickBooks Online's own
  *Import Data* screens accept without editing: a **Customers** spreadsheet and
  an **Invoices** file, laid out exactly the way Intuit's samples are.
- Before importing, turn on *Custom transaction numbers* in QuickBooks, import
  customers before invoices, and choose the same date format on the import
  screen as in Export settings. The page repeats these three steps after every
  download.
- The export tells you what to check: it stops if two clients share a name or
  two invoices share a number (QuickBooks would merge or reject them), and it
  lists invoices whose totals need a second look and invoices you have already
  been paid for, because QuickBooks imports every invoice as open.
- Estimates, work orders and cancelled documents are never exported.

### Clients and invoices

- Clients have **Company**, **Mobile** and **Website** fields, and ZIP codes
  keep their leading zero (`02134`) and their ZIP+4 extension.
- Invoices have **Terms** (Due on receipt, Net 15, Net 30, Net 60) that set the
  due date; the default for new invoices is chosen on the Export page.
- Each invoice line has a **Taxable** checkbox, so labor can be left untaxed
  while materials are taxed. Existing invoices are unchanged.

## v1.5.0 — 2026-09-18

The first release delivered through HandyTally's new release process: it
reaches the demo site first, then `prod.handytally.com`, and your site only
after you have been told the date.

### Your own address

- Your company has its own address, `yourcompany.handytally.com`. Only your
  team can sign in there, and everything you see and enter belongs to your
  company alone.
- The sign-in page shows your company name, and password-reset and invitation
  emails bring people back to your address, not a generic one.
- **Forgot password?** on the sign-in page sends a reset link by email.

### Jobs and scheduling

- Jobs can be assigned to a team member; the assignee shows on the Jobs list
  and on the job itself.
- **Send calendar invite** on a job emails a calendar event to the client, the
  person who created the job and whoever pressed the button. Changing the
  job's dates updates the event; deleting the job cancels it.
- Notes on jobs and clients: titled notes under **Documentation**, editable and
  deletable.
- Job costs are edited in a clearer panel, and saving now saves.
- Estimates can be approved by the client from a button in the email; the
  job then moves on without a phone call.

### Invoices and estimates

- Send an invoice or estimate to the client by email straight from HandyTally.
  Sending an estimate keeps it an estimate.
- Invoice line items can carry notes and photos, and an invoice can carry a
  fixed or percentage fee applied before tax.
- The invoice editor was rebuilt as a document-style page, the same layout you
  see when you print or the client opens the email.
- Invoices export to Excel (with a separate line-items sheet) and import back.

### Clients, inventory and labor

- Set a client's tag directly from the Clients list.
- Add and edit forms for clients, jobs, inventory and labor open in a compact
  dialog instead of a full-page form.
- Every list page exports to and imports from Excel, in the browser and in the
  phone app.

### Admin

- **Admin › Users** invites team members as admins or members, and deactivates
  them.
- **Admin › Company** holds your name, address, tax details and logo, which
  appear on invoices and estimates.
- **Admin › Settings** lets an admin reorder or hide sidebar entries, rename
  labels, add custom fields to jobs and invoices, and switch the whole
  company to Dark mode.
- Every delete asks for confirmation in the same dialog.

### Under the hood

- The sidebar footer shows the version your site runs, and this page shows
  what changed in it.
