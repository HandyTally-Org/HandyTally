# invite-user

Lets an organisation admin invite someone into their organisation as **admin**, **member** or **technician**. Called by the **Admin → Users → Invite user** dialog (`web/utils/inviteUser.ts`) with the admin's session token. HT-12.

| Body field | Meaning |
| --- | --- |
| `email` | Address to invite |
| `firstName`, `lastName` | Optional; stored on `user_profiles` |
| `role` | `admin`, `user` (member) or `technician`. `superuser` is never accepted |
| `organizationId` | The organisation the caller administers |

The caller must hold an active `organization_memberships` row with `role = 'admin'` for that organisation, or be a superuser (`user_profiles.role`). Anyone else gets `403`.

| Case | What happens |
| --- | --- |
| New address | The auth account is created through the Auth admin API (`generateLink` type `invite`), `handle_new_user()` adds the `user_profiles` row, the membership is inserted with the requested role, and the email carries a one-time link to `<app>/set-password?token_hash=…&type=invite` |
| Existing account, not a member | The membership is added (or reactivated with the new role) and the email links to `<app>/login` |
| Existing account, already an active member | `409` |

Responds `{ userId, email, role, existingAccount }`.

The link's origin is `APP_URL` when that secret is set, otherwise the request's `Origin` header (what the browser sends, so localhost works during development). Set `APP_URL` in production so the link never depends on the caller.

## Secrets

| Secret | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key (shared with `send-invoice`) |
| `INVOICE_FROM_ADDRESS` | Verified sender (shared with `send-invoice`) |
| `INVOICE_REPLY_TO` | Optional reply-to |
| `APP_URL` | Optional. The web app's origin, e.g. `https://app.handytally.com` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Injected by the platform; the anon key verifies the caller's session, the service role creates the account and writes the membership |

## Deploy

```bash
supabase functions deploy invite-user
```

Requires the `20260916100000_user_role_technician` and `20260916100100_organization_member_management` migrations to be applied first.
