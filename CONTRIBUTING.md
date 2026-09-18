# Contributing to HandyTally

Thanks for helping build HandyTally. This document covers how work flows through the repository.

## Getting set up

Follow [Getting started](README.md#getting-started) in the README. You need a Supabase project with the migrations applied and the `EXPO_PUBLIC_*` variables in `web/.env`.

## Branches and tickets

- `master` is the integration branch. CI builds the web app from it and deploys the bundle to **`demo.handytally.com` only**. Prod and customer hosts move only with a release (below).
- Every change starts from a ticket, `HT-<n>`. Name the branch after it:

  ```
  feat/ht-12-recurring-invoices
  fix/ht-4-send-dialog-hidden
  chore/ht-20-upgrade-expo
  ```

- Keep branches short-lived and focused on one ticket.

## Commits

- Subject line: `HT-<n>: <imperative sentence>`, e.g. `HT-4: Record sends with sent_at instead of overwriting status`.
- Explain *why* in the body when the reason is not obvious from the diff.
- Commits that change the schema must include the migration in the same commit as the code that depends on it.

## Pull requests

1. Open the PR against `master` using the template.
2. Fill in **what changed**, **why**, and **how you tested it**. Include screenshots for UI changes — most of the app is visual.
3. CI must pass (unit tests, `expo export`, and `RELEASE_NOTES.md` in sync with its generated copy).
4. One approval from a maintainer, then squash-or-merge as appropriate.
5. Add a line under `## Unreleased` in `CHANGELOG.md` (technical). If the customer will notice the change, also add a line to the upcoming section of `RELEASE_NOTES.md` (plain language) and run `npm run release-notes` in `web/`.
6. If the PR touches `web/wrangler.jsonc`: every `env.*` block must still declare its own `routes`. An environment without routes inherits prod's and takes over the apex on its next deploy.

## Releases

Three tiers, one build (HT-41; the full process is [`Docs/release-process.md`](Docs/release-process.md)):

- `demo.handytally.com` runs the latest `master`, deployed on every merge.
- `prod.handytally.com` runs the latest tag `vX.Y.Z`, deployed by `release.yml` when the tag is pushed, which also publishes a GitHub Release with the bundle attached.
- Each customer host runs a pinned tag, never newer than prod, updated only by the manual **Promote release to customer** workflow after the customer has been told and the notes are live on `prod.handytally.com/whats-new`.

A release is a PR (`chore/release-vX.Y.Z`: changelog section, `RELEASE_NOTES.md` section, version in `web/app.json` and `web/package.json`, regenerated `web/constants/releaseNotes.generated.ts`) followed by a tag on its merge commit. Patch = hotfix, minor = features, major = a change a customer must be walked through.

## Database changes

- Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_short_description.sql`.
- Use `ADD COLUMN IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` so the migration is safe to re-run.
- Write a leading comment that explains the design decision. Recent migrations are good examples (see `20260909120000_invoice_sent_at.sql`).
- New tables must have row-level security enabled and policies that scope rows to the caller's organization.
- Anything that touches `auth.*` belongs in `database/auth_functions.sql` and is applied by hand; document it in `database/README.md`.
- Migrations are applied by hand on the host **before** the PR merges ([`Docs/deploy-customer.md` §7](Docs/deploy-customer.md#7-host-access)), and there is **one database for demo, prod and every customer**. From the moment a migration is applied it is live for hosts running older code, so:
  - **Expand, never contract in the same release.** Add tables, columns (nullable or with a default), functions, RPCs and optional edge-function fields. Never rename or drop a column, table, function, RPC signature or policy in the release that stops using it.
  - **The compatibility window is the oldest tag running on any host.** A contract migration ships only when every host's footer shows a tag that no longer needs the old shape; name that tag in its changelog entry.
  - **RLS and trigger changes are rehearsed on a copy of the database first** (`Docs/release-process.md` §6.3): they change what a customer sees the instant they are applied.
  - Edge functions: new request fields are optional, responses only grow; a breaking change is a new function name.

## Edge functions

- One directory per function under `supabase/functions/<name>/` with an `index.ts` and a `deno.json` for imports.
- Read secrets with `Deno.env.get` and fail fast with a clear error if a required one is missing.
- Always handle `OPTIONS` for CORS and reject non-`POST` methods.
- Verify the caller: check the `Authorization` header and, where appropriate, the caller's role.
- Document new secrets in the README configuration table and in `supabase/README.md`.

## Code style

- TypeScript throughout. Prefer explicit types on exported functions and on anything crossing the Supabase boundary.
- Match the surrounding code: React Native Paper components, `StyleSheet.create` at the bottom of the file, `supabase` imported from `lib/supabase`.
- Keep invoice rendering in `web/utils/invoiceHtml.ts` so screen, print and email stay identical.
- Do not add a new top-level dependency without mentioning it in the PR description.

## Secrets

Never commit API keys, service-role keys, tokens or `.env` files. `.env*` is git-ignored; `.env.example` files list the variables without values. If a secret is committed by mistake, rotate it immediately — removing it from history is not enough.

## Reporting bugs and requesting features

Use the issue templates. For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
