# upsert-calendar-event

Mirrors `public.jobs` rows to a Nylas calendar. Called by a **database webhook**, not by the app.

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
| `NYLAS_API_KEY`, `NYLAS_API_URI` | Nylas credentials |
| `NYLAS_GRANT_ID`, `NYLAS_CALENDAR_ID` | Target calendar |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injected by the platform; used to read `clients` and write `jobs.calendar_event_id` without depending on row-level-security policies |

## Deploy

```bash
supabase functions deploy upsert-calendar-event
```
