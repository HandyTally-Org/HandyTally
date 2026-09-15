# Admin section

Admin-only screens. Each one calls `useRequireAdmin()` (`web/hooks/useRequireAdmin.ts`) and renders nothing for anyone who is not an admin of their organisation or a superuser; the drawer also hides the Admin entry for everyone else. That is route gating only — the database functions and the edge function these screens call check the caller's role themselves.

## Users (`users.tsx`) — HT-12

The members of the signed-in admin's organisation (`AuthContext.organization`), with role and status.

| Action | Goes through |
| --- | --- |
| List | `list_organization_members(org_id)` |
| Invite (email, name, role admin / member / technician) | `invite-user` edge function — creates the account, adds the membership, emails a one-time link to `/set-password` |
| Change role | `set_organization_member_role(org_id, target_user_id, new_role)` |
| Deactivate / reactivate | `set_organization_member_active(org_id, target_user_id, active)` |
| Send password reset | `supabase.auth.resetPasswordForEmail`, landing on `/set-password` |

Roles are `organization_memberships.role`; `user_profiles.role` is only used to recognise superusers. See `supabase/migrations/20260916100100_organization_member_management.sql` and `supabase/functions/invite-user/README.md`.

## Company (`company.tsx`)

Company profile and logo. Admin-only since HT-12.
