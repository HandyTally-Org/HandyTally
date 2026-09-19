# Releasing HandyTally: demo → prod → customer hosts

How a change travels from a merged pull request to a customer's screen, and
what to do at each step. Written for HT-41; the mechanism is in
[architecture.md §8](architecture.md#8-build-and-deployment), the customer
onboarding runbook is [deploy-customer.md](deploy-customer.md). If a step
here no longer matches what the workflows do, fix it in the same PR.

## 1. The three tiers

| Host | Role | Runs | Updated by | Audience |
| --- | --- | --- | --- | --- |
| `demo.handytally.com` | Sandbox and sales demo | Latest `master` | Every merge to `master` (automatic, `ci.yml`) | Lucas, prospects |
| `prod.handytally.com` (also the apex, `www` and any subdomain never promoted) | Official tested template: the exact build every customer gets | Latest release tag `vX.Y.Z` | Pushing a tag (automatic, `release.yml`) | Lucas |
| `wgelectricus.handytally.com` and each future customer | Customer | A **pinned** release tag, never newer than prod | Manual *Promote release to customer* run (`promote.yml`), after the customer has been told | The customer |

Rules that follow:

1. Nothing reaches a customer that has not run on prod, and nothing reaches prod that has not run on demo.
2. Prod always runs a tagged release. A customer runs a tag that is the same as or older than prod's; the promote workflow refuses anything newer.
3. The notes for a version are live on `prod.handytally.com/whats-new` and have been sent to the customer before that version is promoted to them.
4. Code is per host. **The database, auth service and edge functions are shared by all tiers.** See §6.

Every host says what it runs: the sidebar footer (`v1.5.0 · prod`,
`v1.5.0 · wgelectricus`, `master-3f2a1c9 · demo`) and
`https://<host>/release.json`. Put the footer text in the DevIssues
`Version` field when reporting a bug.

## 2. Version numbers

Semver tags, `vMAJOR.MINOR.PATCH`, always with the `v`:

- **Patch** (`v1.5.1`): a hotfix for something already released.
- **Minor** (`v1.6.0`): features.
- **Major** (`v2.0.0`): a change a customer must be walked through in person.

`web/app.json` and `web/package.json` carry the same number without the `v`.
The old tag `v1.04` (2025-12) stays as history.

## 3. Cutting a release

| Step | Action | Result |
| --- | --- | --- |
| 1. Build | Merge PRs to `master` as usual | `demo.handytally.com` updates in about three minutes. Try the change there. Repeat until a release is worth cutting |
| 2. Release PR | Open `chore/release-vX.Y.Z` with the checklist below. Merge it | `master` carries the version, changelog and notes |
| 3. Tag | `git tag vX.Y.Z <merge commit>` and `git push origin vX.Y.Z` | `release.yml` builds the tag, creates the GitHub Release with the notes and `web-dist-vX.Y.Z.tar.gz`, deploys prod and verifies `prod.handytally.com/release.json` |
| 4. Verify prod | §4 smoke test on `prod.handytally.com` | Prod is the template |
| 5. Tell the customer | Send §5 at least two working days ahead. Avoid Fridays and the customer's invoicing day | The customer knows what and when |
| 6. Promote | GitHub › Actions › *Promote release to customer* › Run workflow: `tag = vX.Y.Z`, `customer = wgelectricus`. About a minute | The customer runs `vX.Y.Z`; the run fails if their host does not report it |
| 7. Verify the customer host | Footer shows `vX.Y.Z · wgelectricus`; a deep link and a sign-in work | Done; log it in §8 |

### Release PR checklist

- [ ] `CHANGELOG.md`: move everything under `## Unreleased` to `## X.Y.Z — YYYY-MM-DD`. Keep an empty `## Unreleased` above it.
- [ ] `RELEASE_NOTES.md`: a `## vX.Y.Z — YYYY-MM-DD` section in plain language for the customer, no ticket numbers, no table names. What they will see, what they should do differently.
- [ ] `web/app.json` and `web/package.json`: `"version": "X.Y.Z"`.
- [ ] `cd web && npm run release-notes` and commit `constants/releaseNotes.generated.ts` (CI fails if it is stale).
- [ ] Every migration merged since the last tag is expand-only (§6.1); any contract migration names the tag that made it safe.
- [ ] `web/wrangler.jsonc`: every `env.*` block still declares its own `routes` (an env block without routes takes over the apex on its next deploy).
- [ ] CI is green on the PR.

### Re-running a release

Re-running `release.yml` for an existing tag rebuilds the bundle, replaces
the Release asset and notes, and redeploys prod. Do that only for a build
problem; a code change is a new patch tag.

## 4. Smoke test (prod, then the customer host after a promote)

- [ ] Footer shows the expected version and channel; `https://<host>/release.json` says the same.
- [ ] `https://<host>/whats-new` renders the notes for that version without signing in.
- [ ] Sign in; the dashboard loads with the organisation's data.
- [ ] Deep link `https://<host>/jobs/123` loads the app, not a Worker 404.
- [ ] Create a client, open a job, open an invoice preview.
- [ ] Sign out and back in.
- [ ] On prod only: `https://handytally.com` still shows the sign-in card and `https://demo.handytally.com` still works.

## 5. Telling the customer

At least two working days before the promote, from Lucas's mailbox:

```
Subject: HandyTally update on <weekday, date>

Hi <name>,

On <date> around <time> your HandyTally (wgelectricus.handytally.com) will update to version <X.Y.Z>.
What changes: https://prod.handytally.com/whats-new
Nothing changes in your data; the update takes about a minute and open tabs pick it up on their next reload.
If that day or time is bad for you, reply and I will move it.

Lucas
```

After the promote, members see a one-time "HandyTally was updated to
vX.Y.Z · What's new" message on their next load.

## 6. The shared backend

All tiers use the same Postgres, GoTrue and edge runtime. A migration is
applied **once**, by hand on the Coolify host before its PR merges
([deploy-customer.md §7](deploy-customer.md#7-host-access)), and from that
second it is live for demo, prod and every customer even though their code
differs. The tiers protect customers from *code* they have not seen; they
cannot protect them from *schema*. The rules, also in
[CONTRIBUTING.md § Database changes](../CONTRIBUTING.md#database-changes):

### 6.1 Expand, never contract in the same release

Add tables, add columns (nullable or with a default), add functions and RPCs,
add *optional* edge-function fields. Never rename or drop a column, table,
function, RPC signature or policy in the release that stops using it. A
20-minute "column does not exist" window already broke saving a job once
(HT-35); with pinned customers that window is days or weeks.

### 6.2 The compatibility window is the oldest tag running on any host

A contract migration (drop the old column, remove the old RPC) ships only once
every host's footer shows a tag that no longer needs the old shape. Say which
tag that is in the changelog entry of the contract migration.

### 6.3 RLS and trigger changes are rehearsed first

They change what a customer sees the moment they are applied (HT-55 style).
Rehearse on a copy of the database before applying for real:

```
# on the Coolify host, inside the db container (deploy-customer.md §7)
createdb -U supabase_admin ht_rehearsal
pg_dump -U supabase_admin --no-owner postgres | psql -U supabase_admin -d ht_rehearsal
psql -U supabase_admin -d ht_rehearsal -v ON_ERROR_STOP=1 -1 < /root/ht-deploy/<migration>.sql
```

Then, in `ht_rehearsal`, reproduce each tier's view with the tenant header
and a member's JWT claims:

```sql
select set_config('request.jwt.claims', '{"sub":"<user uuid>","role":"authenticated"}', true);
select set_config('request.headers', '{"x-tenant-subdomain":"wgelectricus"}', true);
set local role authenticated;
select count(*) from clients;   -- must be that organisation's rows only
```

Repeat for `demo`, `prod` and each customer subdomain, then
`dropdb ht_rehearsal`. The first time through, record in this section
whether dump/restore works on this stack (pgsodium is the likely obstacle)
and what had to be done about it.

### 6.4 Edge functions

One copy per function on the host serves every tier. New request parameters
are optional; response shapes only grow. If a breaking change is unavoidable,
deploy it under a new name (`send-invoice-v2`) and retire the old one when no
running tag calls it.

### 6.5 Stale tabs

A customer with a tab open keeps running the old bundle until they reload.
6.1 and 6.2 cover that case; nothing extra is needed.

### 6.6 Not now: a separate demo database

It would give demo real schema isolation (`web/lib/supabase.ts` already reads
`EXPO_PUBLIC_SUPABASE_URL`), but it doubles the Coolify footprint, means every
migration is applied twice, and the compose stack is fragile (full redeploys
have failed on the MinIO pull). Reconsider when a migration causes a customer
incident despite 6.1 to 6.3.

## 7. Rollback and hotfix

**Roll a customer back (code only):** run *Promote release to customer* again
with the previous tag. The guard allows an older tag. Alternatively, from a
machine with Cloudflare credentials, `cd web && npx wrangler rollback --env
wgelectricus` (Cloudflare keeps the last versions of each Worker).

**Roll prod back:** open the previous tag's run of `release.yml` under
GitHub › Actions and *Re-run all jobs*; it rebuilds that tag, refreshes its
Release asset and redeploys prod. If the problem is in the code rather than
the build, cut a patch tag that reverts the change instead (`v1.5.1`). Prod
is not customer-facing, so a short delay is acceptable.

**Data cannot be rolled back** by any of this; §6 is where that discipline
holds.

**Hotfix:**

1. `git checkout -b fix/ht-<n>-<slug> vX.Y.Z` (branch from the tag, not from `master`).
2. Fix, PR against `master` as usual, merge (demo gets it).
3. `git tag vX.Y.(Z+1) <the merge commit or a cherry-pick onto the tag>` and push the tag: prod updates automatically.
4. Tell the customer (a hotfix can be same-day if it fixes something they reported), promote.

## 8. Walkthrough log

| Date | Version | Steps | By | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-18 → 19 | v1.5.0 | §3 steps 1–7: dry run on demo (`master-939581c`), release PR #106 (changelog cut + backfill, notes dated, version `1.5.0`, notes regenerated), tag `v1.5.0` on `7e7ac96` pushed 01:34Z, `release.yml` run 35413090773 (Build → GitHub Release `web-dist-v1.5.0.tar.gz` → prod, verified `/release.json`), §4 smoke test on prod, *Promote* run 35413297679 (`v1.5.0`, `wgelectricus`) 01:38Z, §4 smoke test on the customer host | Lucas (commands, tests) with Claude | First release through this process. Step 5 (customer notice) skipped on purpose: until its first promote the customer host was served by the prod catch-all, so it had already received `v1.5.0` with the prod deploy and nothing changed for the customer. Every later release goes through step 5. Guards observed working: env routes check, `prod runs v1.5.0; promoting the same build`. `index.html` is served `Cache-Control: max-age=0, must-revalidate`, so a promote is picked up on the next load (§8 caching question closed) |
