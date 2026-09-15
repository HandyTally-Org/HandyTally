-- HT-12: drop the zero-argument get_user_organizations() (returns uuid[]).
--
-- Two overloads exist: this one and get_user_organizations(target_user_id
-- uuid default auth.uid()) returning a table. Because the second has a
-- default, a call with no arguments matches both and Postgres refuses it
-- ("is not unique"), which is what broke the web app's membership lookup.
-- Nothing in the repo calls the uuid[] version; the RLS policies use
-- user_has_org_access() and is_superuser() instead.

drop function if exists public.get_user_organizations();
