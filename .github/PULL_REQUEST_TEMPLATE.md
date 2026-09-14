## Ticket

HT-

## What changed

<!-- One or two sentences. Link the ticket above. -->

## Why

<!-- The problem this solves or the behaviour it enables. -->

## How to test

<!-- Steps a reviewer can follow. Include screenshots or a short recording for UI changes. -->

## Checklist

- [ ] Branch is named `feat|fix|chore/ht-<n>-…` and commits are prefixed `HT-<n>:`
- [ ] Web app builds (`cd web && npx expo export`)
- [ ] Schema changes include a migration under `supabase/migrations/` with a comment explaining why
- [ ] New tables have RLS enabled and org-scoped policies
- [ ] New edge-function secrets are documented in `README.md` and `supabase/README.md`
- [ ] No secrets or `.env` files are committed
- [ ] `CHANGELOG.md` updated under **Unreleased**
