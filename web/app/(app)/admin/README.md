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

Roles are `organization_memberships.role`; `user_profiles.role` is only used to recognise superusers. See `supabase/migrations/20260916100100_organization_member_management.sql` and `supabase/functions/invite-user/README.md`.

## Company (`company.tsx`)

Company profile and logo. Admin-only since HT-12.

## Export (`export.tsx`) — HT-25

Files for other systems. One target today: **QuickBooks Online**, whose Import Data screens take the files as written.

| Download | File | Rules |
| --- | --- | --- |
| Customers | `quickbooks-customers.xlsx`, sheet `Sheet1`, Intuit's 16 columns | Optional tag filter; ZIP written as text; Country from Export settings; optional opening balance (sum of open invoice totals) instead of exporting invoices |
| Invoices | `quickbooks-invoices.csv` (`-1`, `-2`… when over 1,000 rows) | One row per line item; header values on the first row of each invoice; `*ItemAmount` recomputed as qty × rate; a *Service Fee* line for the invoice fee; `Taxable`/`TaxRate` per line; `Terms` from `invoices.terms` or the date gap; estimates, work orders and cancelled documents never included |

Blockers (duplicate client names, duplicate or missing invoice numbers, missing client) stop the download and are listed; warnings (recomputed amounts, total mismatches, paid invoices — QBO imports every invoice as open) are listed under the download. Export settings (country, default terms, date format) live in `organization_settings.export`. All rules are in `web/utils/quickbooksExport.ts` and are unit-tested; the screen only fetches rows (scoped to the organisation explicitly) and shows results.
