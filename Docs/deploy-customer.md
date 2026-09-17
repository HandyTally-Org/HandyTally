# Bringing a customer live on `<subdomain>.handytally.com`

A repeatable runbook for onboarding one customer (WGElectric, a second test
customer, the next paying customer). Follow it top to bottom. §8 records
which steps have been run for real and when; a step that is not listed there
was written from the code that performs it and has not yet been exercised.
Track each onboarding with the *Customers* checklist in Notion (HandyTally
page), which mirrors §3.

Written for HT-41. If a step no longer matches reality, fix the step here in
the same PR that changed the behaviour.

## 1. What a customer deployment is

One web bundle, one database, and the hostname selects the organisation.
There is **no** DNS, hosting, Supabase or edge-function work per customer:
the Cloudflare Worker serves every `*.handytally.com` host from the same
build, the browser sends its subdomain to the database on every request, and
row-level security keeps each organisation's rows to that organisation.

The decision and the mechanism are recorded once, in
[architecture.md §4 Multi-tenancy](architecture.md#4-multi-tenancy). This
document only tells you what to do; read §4 if you want to know why.

Provisioning a customer therefore means three database rows and a company
profile:

| Row | Where it is made |
| --- | --- |
| `organizations` (name, `subdomain`, `status = active`) | admin-app › Organizations, or the SQL in §3.2 |
| `organization_memberships` for the owner (`role = admin`, `is_active`) | Admin › Users › Invite on the customer host, or the SQL in §3.3 |
| `auth.users` + `user_profiles` for the owner | created by the invite |
| `company` (name, address, tax, logo) | the owner fills Admin › Company on their host |

## 2. Prerequisites (one-time, already in place)

These were done under HT-26 and are true today. Check them only when a new
subdomain misbehaves — each line has the one command that proves it.

| What | Proof |
| --- | --- |
| Wildcard DNS record `*.handytally.com` exists on Cloudflare, proxied (HT-37) | `curl -sI https://no-such-tenant-xyz.handytally.com/ \| head -1` → `HTTP/2 200` (not NXDOMAIN, not a certificate error) |
| Worker route `*.handytally.com/*` is deployed (HT-37) | [`web/wrangler.jsonc`](../web/wrangler.jsonc) lists the three routes; `curl -s https://demo.handytally.com/jobs/123 -o /dev/null -w '%{http_code}'` → `200` (SPA fallback serves deep links) |
| The app resolves the tenant from the hostname (HT-38) | `curl -s https://supabase.axiappm.com/rest/v1/rpc/get_organization_by_subdomain -H "apikey: <anon key from web/lib/supabase.ts>" -H "Content-Type: application/json" -d '{"p_subdomain":"demo"}'` → one row with `"status":"active"` |
| Tenant-scoped RLS is applied (HT-55) | In psql on the host (§7): `select polname from pg_policies where tablename = 'clients';` → exactly `tenant_scoped` |
| GoTrue allows redirects to every subdomain (HT-39) and sends mail (HT-30) | Coolify › supabase-auth: `GOTRUE_URI_ALLOW_LIST` contains `https://*.handytally.com/**`, `GOTRUE_SITE_URL=https://handytally.com`, `API_EXTERNAL_URL=https://supabase.axiappm.com`, SMTP host `smtp.resend.com`. Mirrored in [`supabase/config.toml`](../supabase/config.toml) `[auth]` |
| The `invite-user` edge function is on the host (HT-12 / HT-39) | `ssh … "ls /data/coolify/services/<service>/volumes/functions/invite-user/index.ts"` — path in §7 |

## 3. Per-customer steps

Everything below is done by a **superuser** (`user_profiles.role = 'superuser'`),
who can sign in on any customer host. Today that is `support@wgelectricus.com`
and `admin@handytally.com`.

### 3.1 Pick the subdomain

Rules, enforced by `create-organization` and repeated here so you can check
before you type: 3–63 characters, lowercase letters, digits and hyphens, not
starting or ending with a hyphen, unique, and not one of the reserved names
`www api admin app mail ftp localhost staging test`. Only first-level
subdomains are routed (`acme.handytally.com`, never `eu.acme.handytally.com`).

Confirm it is free:

```
select subdomain, status from organizations where subdomain = '<sub>';
```

No row means free. An `inactive` row is a previous customer or a test
organisation — reactivate it (§5) rather than creating a second one, because
`subdomain` is unique.

### 3.2 Create the organisation

**Preferred — admin-app.** Run the superuser console locally
([admin-app/README.md](../admin-app/README.md): `npm install && npx expo start --web`),
sign in as the superuser, *Organizations › Create*, enter the name and the
subdomain. This calls `create-organization`, which validates the subdomain
(§3.1) and inserts the row with `status = 'active'`. Nothing else happens;
the host is live immediately.

**Fallback — SQL**, in psql on the host (§7), when the admin-app is not
handy. `create-organization` sets `domain` too, so do the same:

```sql
insert into public.organizations (name, subdomain, domain, status)
values ('<Customer name>', '<sub>', '<sub>.handytally.com', 'active')
returning id;
```

Keep the returned `id`; §3.3 needs it.

Verify from outside:

```
curl -s https://supabase.axiappm.com/rest/v1/rpc/get_organization_by_subdomain \
  -H "apikey: <anon key>" -H "Content-Type: application/json" \
  -d '{"p_subdomain":"<sub>"}'
```

One active row back, and `https://<sub>.handytally.com` now shows the sign-in
page instead of *No company found at this address*.

### 3.3 Create the owner's account and admin membership

**Preferred — invite from the customer host.** Open
`https://<sub>.handytally.com`, sign in as the superuser (superusers pass the
membership check on every host), go to *Admin › Users › Invite*, enter the
owner's name and email, role **Admin**. The `invite-user` function
creates the auth account, the `user_profiles` row and an active
`organization_memberships` row with `role = 'admin'`, and emails a
set-password link built from the host you invited from — so the link opens
on `<sub>.handytally.com`, not the apex. Inviting an address that already has
an account only adds the membership and emails a link to the login page.

**Fallback — SQL**, when the owner already has an account (for example an
existing user moving to a new organisation) and you want no email:

```sql
insert into public.organization_memberships (user_id, organization_id, role, is_active)
select u.id, '<organization id from 3.2>', 'admin', true
from auth.users u
where u.email = '<owner email>'
on conflict (user_id, organization_id)
do update set role = 'admin', is_active = true;
```

There is no SQL fallback for creating the auth account itself; use the
invite, or *admin-app › Users* which goes through the auth admin RPCs.

### 3.4 Company profile

As the owner (or the superuser, on the customer host): *Admin › Company*.
Fill in name, address, tax details and upload the logo. The `company` row
and its `company_attachments` are stamped with the organisation from the
hostname, and the invoice and estimate documents read them. The page shows
an empty form until the first save; that is expected for a new organisation.

### 3.5 Optional: import existing data

Clients, Jobs, Invoices, Labor (services) and Inventory (materials) each
have an *Import from Excel* button next to *Export* on their list page. Export
first to get a workbook with the exact column headers, fill it, import it.
Imports run on the customer host, so every row lands in that organisation.

## 4. Smoke test

Do this on `https://<sub>.handytally.com` before telling the customer.
Tick every line; the two email lines need a real mailbox you can read.

- [ ] `https://<sub>.handytally.com` loads over HTTPS with no certificate warning and shows the sign-in page.
- [ ] Deep link: `https://<sub>.handytally.com/jobs/123` loads the app — the sign-in page when signed out, *job not found* when signed in. What matters is that it is not a Worker 404.
- [ ] Sign-in is gated to members: sign in with a user who belongs to a **different** organisation → *You are not a member of `<Customer name>`* and no data is shown.
- [ ] The owner signs in and sees an **empty** app — no clients, jobs, invoices, materials or services from anyone else. If rows from another organisation appear, stop: see §6.
- [ ] Create a client.
- [ ] Create a job for that client with a date → the calendar invite email arrives (`upsert-calendar-event` via Resend).
- [ ] Create an invoice for that job and *Send* it → the invoice email arrives with the company name and logo from §3.4.
- [ ] Sign out, *Forgot password* → the email link opens on `<sub>.handytally.com/set-password`, not on `handytally.com`, and the reset completes.
- [ ] Invite a second user from *Admin › Users* → the link in their email opens on `<sub>.handytally.com`.
- [ ] `https://handytally.com` still shows the *sign in at your company's address* card, and `https://demo.handytally.com` still works.

Then, on the host, confirm nothing fell back silently:

```
docker logs supabase-auth-<service> --since 30m 2>&1 | grep -i "redirect_to not allowed"
```

No output is the pass condition.

## 5. Rollback and offboarding

Data is never deleted by this procedure.

**Take the host offline** (customer leaves, or something is wrong and you
want the door shut while you look):

```sql
update public.organizations set status = 'inactive', updated_at = now()
where subdomain = '<sub>';
```

`get_organization_by_subdomain` only returns active rows, so
`https://<sub>.handytally.com` shows *No company found at this address*
immediately and nobody can sign in there. Members keep their accounts.

**Stop individual users** without touching the organisation, from
*Admin › Users* (deactivate) or:

```sql
update public.organization_memberships set is_active = false
where organization_id = (select id from organizations where subdomain = '<sub>')
  and user_id = (select id from auth.users where email = '<email>');
```

**Bring it back:** set `status = 'active'` (and `is_active = true` on the
memberships you deactivated). Nothing else is needed.

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `NXDOMAIN` / *This site can't be reached* for the new host | The wildcard record is missing, or a record was written to a provider that is not authoritative (HT-26 wrote CNAMEs to Route 53 while DNS lived on Cloudflare) | Cloudflare › DNS: `A *` proxied record must exist. `dig +short <sub>.handytally.com` must return Cloudflare addresses |
| Certificate error on the subdomain | The record is not proxied (grey cloud), so Cloudflare's wildcard certificate is not in front of it | Turn the proxy on for the `*` record |
| Cloudflare 404 / Worker not found | The `*.handytally.com/*` route was removed from the Worker | Restore the route in `web/wrangler.jsonc` and push to `master` |
| *No company found at this address* | No `organizations` row with that exact subdomain, or its `status` is not `active` | §3.1 / §5 |
| *You are not a member of `<name>`* on sign-in | The user has no active `organization_memberships` row for **this** organisation (they may be a member elsewhere) | Invite them from this host, or reactivate the membership (§5) |
| Auth email link opens `handytally.com` instead of the subdomain | `GOTRUE_URI_ALLOW_LIST` lacks `https://*.handytally.com/**`, so GoTrue fell back to `SITE_URL` (the browser shows no error) | Fix the Coolify env, restart `supabase-auth` only; check the log for `redirect_to not allowed` |
| Auth email link points at `http://supabase-kong:8000/…` | `API_EXTERNAL_URL` is unset, so GoTrue used the compose default (internal hostname) | Set `API_EXTERNAL_URL=https://supabase.axiappm.com` on `supabase-auth` |
| No auth email at all, GoTrue logs *Noop mail client* | SMTP not configured on `supabase-auth` | HT-30: Resend SMTP values on the service, only `SMTP_PASS` as a Coolify variable |
| Invite fails with *the request origin is not a HandyTally host* | The invite was sent from a host that is not `https://*.handytally.com` or `localhost`, and `APP_URL` is not set | Invite from the customer host; for local work set `APP_URL` on the edge runtime |
| A customer sees another organisation's rows | Isolation is per request, driven by the `x-tenant-subdomain` header. Something issued the request without it: a second Supabase client in the app (HT-29 — the app must have exactly one, `web/lib/supabase.ts`), a request path with no header (apex, native, psql, an edge function using a user JWT) which falls back to the caller's memberships, or a `service_role` key, which bypasses RLS entirely. It is **not** rows with `organization_id = NULL` any more; HT-40 moved those to `demo` | Find the request without the header. `grep -rn createClient web/ --include=*.ts*` should show one client |
| New rows land in the wrong organisation | Same cause: the insert reached the database without the header, so `auto_set_organization_id()` used the caller's best membership (a superuser working on several tenants is the usual case) | Do customer data entry on the customer host, not on localhost or through psql |
| Password reset from the subdomain lands on the apex sign-in card | The app's `forgot-password` screen passes `redirectTo = <origin>/set-password`; if the link still goes to the apex the allow list is the cause | As the allow-list row above |

## 7. Host access

The database and edge functions live in a self-hosted Supabase stack on the
Coolify host. Migrations are applied by piping the file into psql inside the
database container (not `supabase db push`), and edge functions are copied
into the functions volume (not `supabase functions deploy`).

```
ssh -i ~/.ssh/id_ed25519_handytally root@<coolify host> \
  'docker exec -i supabase-db-<service> psql -U supabase_admin -d postgres'
```

`<service>` is the Coolify service id shared by every container of the
stack (`docker ps --format '{{.Names}}'` shows it). Use `supabase_admin`, not
`postgres`: the `postgres` role does not own the application tables. Edge
functions are files at
`/data/coolify/services/<service>/volumes/functions/<name>/index.ts`; a copy
takes effect on the next request, environment changes need the service
restarted. Restart `supabase-auth` alone for auth env changes — a full stack
redeploy has failed on the MinIO image pull before.

## 8. Walkthrough log

| Date | Customer | Steps run | By | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-16 | wgelectricus | §3.2 (existing row set active by migration `20260917130000`), §3.3 (owner already admin), §3.4 (company row moved by the same migration), §4 password-reset line | Lucas | HT-40 / HT-39. Subdomain renamed from `wgelectric` to `wgelectricus` the same day |
| 2026-09-16 | demo | §2 rows 1–3 (curl checks), §4 first two lines and the apex line, from a browser with no session | Claude (HT-41) | Everything that needs a superuser session or host SSH — §3.2 SQL, §3.3, §4 email lines, §5 — still to be walked once for a fresh organisation |
