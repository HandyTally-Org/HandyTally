# Supabase

Schema migrations and Deno edge functions for HandyTally. The project runs on a self-hosted Supabase instance; `config.toml` configures the local CLI environment.

## Migrations

```bash
supabase link --project-ref <ref>
supabase db push                 # apply pending migrations
supabase migration new <name>    # create a new empty migration
```

Migrations are applied in filename order. Files prefixed `2025…_remote_schema.sql` are snapshots pulled from the hosted project; later files are hand-written and start with a comment explaining the change. Follow that pattern.

Auth-schema helpers (`get_all_users`, `admin_*`) are not migrations — they live in [`../database/auth_functions.sql`](../database/auth_functions.sql) and are applied by hand through the SQL editor.

## Edge functions

| Function | Trigger | Does |
| --- | --- | --- |
| `send-invoice` | Called from the web app when a user clicks **Send** on an invoice or estimate | Emails the invoice HTML to the client via Resend. The caller renders the HTML with `web/utils/invoiceHtml.ts` and posts `{ to, subject, html, attachments? }`. Requires a signed-in user's bearer token. |
| `upsert-calendar-event` | Database webhook on `jobs` (insert / update / delete), and the **Send calendar invite** button on the Jobs screens (`{ action: "send", jobId }` with the user's token) | Emails an iCalendar invitation through Resend to the client and to the user who created the job (`jobs.created_by`), so the job appears on both of their calendars. Updates resend the same UID with a higher sequence; deletes send a cancellation. Stores the UID in `jobs.calendar_event_id`. Configure the webhook in **Database → Webhooks** after deploying. |
| `create-organization` | Called from the admin app | Validates the requested subdomain and inserts the organization as `active`; the Cloudflare wildcard route serves the new host, so nothing else is provisioned. Caller must be an active `superuser`. |

### Deploy

```bash
supabase functions deploy send-invoice
supabase functions deploy upsert-calendar-event
supabase functions deploy create-organization
```

### Run locally

```bash
supabase start
supabase functions serve send-invoice --env-file supabase/functions/.env
```

### Secrets

Set with `supabase secrets set KEY=value` (or in the dashboard under **Edge Functions → Secrets**). `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

| Function | Secret |
| --- | --- |
| `send-invoice` | `RESEND_API_KEY`, `INVOICE_FROM_ADDRESS`, `INVOICE_REPLY_TO` (optional) |
| `upsert-calendar-event` | `RESEND_API_KEY`, `INVOICE_FROM_ADDRESS` (shared with `send-invoice`); `CALENDAR_FROM_ADDRESS`, `INVOICE_REPLY_TO` (optional) |
| `create-organization` | `BASE_DOMAIN` (defaults to `handytally.com`) |

### Writing a new function

1. `supabase functions new <name>` — creates `functions/<name>/index.ts`.
2. Add a `deno.json` with an `imports` map for any npm packages.
3. Handle `OPTIONS` for CORS, reject non-`POST`, and check the `Authorization` header before doing anything.
4. Read secrets with `Deno.env.get` and return a clear 500 if a required one is missing.
5. Document the function and its secrets in this file and in the root README.
