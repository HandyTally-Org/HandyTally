# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Email **admin@handytally.com** with:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- the affected area (web app, admin app, a specific edge function, database policy).

You will get an acknowledgement within 3 business days. We ask that you give us a reasonable window to fix the issue before disclosing it.

## Scope

- `web/` and `admin-app/` client code
- `supabase/functions/*` edge functions
- Row-level security policies and `SECURITY DEFINER` functions in `supabase/migrations/` and `database/`
- Tenant isolation between organizations

## What we care about most

- Cross-tenant data access (one organization reading or writing another's rows)
- Privilege escalation to `admin` or `superuser`
- Bypassing authentication on edge functions
- Leaking secrets through client bundles or logs

## Handling secrets

Supabase service-role keys, Resend, Nylas, AWS and Vercel credentials live only in Supabase function secrets or deployment environment variables. They must never be committed. If you find one in the repository or its history, report it and it will be rotated.
