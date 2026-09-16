# Contributing to HandyTally

Thanks for helping build HandyTally. This document covers how work flows through the repository.

## Getting set up

Follow [Getting started](README.md#getting-started) in the README. You need a Supabase project with the migrations applied and the `EXPO_PUBLIC_*` variables in `web/.env`.

## Branches and tickets

- `master` is the deployable branch. CI builds the web app from it and deploys the bundle to Cloudflare Workers.
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
3. CI must pass (web app builds with `expo export`).
4. One approval from a maintainer, then squash-or-merge as appropriate.

## Database changes

- Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_short_description.sql`.
- Use `ADD COLUMN IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` so the migration is safe to re-run.
- Write a leading comment that explains the design decision. Recent migrations are good examples (see `20260909120000_invoice_sent_at.sql`).
- New tables must have row-level security enabled and policies that scope rows to the caller's organization.
- Anything that touches `auth.*` belongs in `database/auth_functions.sql` and is applied by hand; document it in `database/README.md`.

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
