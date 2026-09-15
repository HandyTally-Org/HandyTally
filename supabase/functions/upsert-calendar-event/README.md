# upsert-calendar-event

Emails a calendar invitation for each `public.jobs` row to the client and to the user who created the job. Called by a **database webhook**, not by the app.

The invite is a standard iCalendar file sent through Resend as a `text/calendar` attachment. Gmail, Outlook and Apple Mail show it as an invitation with Yes / No / Maybe, and the event lands on the recipient's own calendar. There is no calendar API and nothing to connect.

| Event on `jobs` | What is sent |
| --- | --- |
| Insert, or update of a job that was never invited | `METHOD:REQUEST` — a new invitation |
| Update of an already-invited job | `METHOD:REQUEST` with the same UID and a higher `SEQUENCE` — the recipient's event is updated in place |
| Delete | `METHOD:CANCEL` with the same UID — the event is removed from the recipient's calendar |

Recipients are the client's email and the creator's login email (`jobs.created_by` → `auth.users`), de-duplicated. A job with no start date, or with no recipient email, is skipped with a `200` and a `skipped` reason in the log.

`jobs.calendar_event_id` holds the invite's UID (`job-<uid>@handytally`) once one has gone out. Jobs that still carry an event id from the earlier Nylas integration are not sent a cancellation on delete, because nobody received an invitation for them under this scheme.

## Webhook configuration

After deploying, create (or update) the webhook on the self-hosted dashboard under **Database → Webhooks**:

| Setting | Value |
| --- | --- |
| Table | `public.jobs` |
| Events | Insert, Update, Delete |
| Type | Supabase Edge Function → `upsert-calendar-event` |
| HTTP header `Authorization` | `Bearer <SUPABASE_SERVICE_ROLE_KEY>` |
| HTTP header `Content-Type` | `application/json` |

The function accepts **only** the service-role key as the bearer token. Any other token — including the anon key, which is public — gets `401`. The gateway's own JWT check (`verify_jwt = true` in `config.toml`) is not sufficient on its own because the anon key passes it.

## Secrets

| Secret | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key (shared with `send-invoice`) |
| `INVOICE_FROM_ADDRESS` | Verified sender; appears as the invite's organiser (shared with `send-invoice`) |
| `CALENDAR_FROM_ADDRESS` | Optional. Overrides the sender for invites only, e.g. `HandyTally Schedule <schedule@handytally.com>` |
| `INVOICE_REPLY_TO` | Optional reply-to |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injected by the platform; used to verify the webhook, read `clients` and `auth.users`, and write `jobs.calendar_event_id` without depending on row-level-security policies |

## Deploy

```bash
supabase functions deploy upsert-calendar-event
```
