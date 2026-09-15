-- HT-12: organisation member management for the web app.
--
-- Who is an admin
-- ---------------
-- Two roles live in the schema and they mean different things:
--   user_profiles.role             global -- 'superuser' runs the whole
--                                  platform, everyone else is 'user'
--   organization_memberships.role  what the person is *inside* one
--                                  organisation: admin, user (member) or
--                                  technician
-- "Org admin" therefore means an active membership with role = 'admin', or a
-- superuser. The existing admin.create_organization_user / add_user_to_...
-- functions require user_profiles.role = 'admin' as well, which no
-- organisation-created account ever has, so they are unusable from the app
-- and left alone here.
--
-- Row-level security on organization_memberships only lets a user read their
-- own row, so the member list and the role / active changes go through
-- SECURITY DEFINER functions that check the caller themselves. Creating the
-- account and sending the email happens in the invite-user edge function,
-- which needs the service role.

set check_function_bodies = off;

-- True when the caller may manage members of org_id.
create or replace function public.is_org_admin(org_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'superuser' and is_active = true
  ) or exists (
    select 1 from public.organization_memberships
    where user_id = auth.uid()
      and organization_id = org_id
      and role = 'admin'
      and is_active = true
  );
$function$;

-- Everyone in the organisation, active or not. Any active member may read it
-- (HT-9 will need the list to assign technicians); only admins may change it.
create or replace function public.list_organization_members(org_id uuid)
 returns table (
   user_id uuid,
   email text,
   first_name text,
   last_name text,
   role user_role,
   is_active boolean,
   joined_at timestamptz,
   last_sign_in_at timestamptz
 )
 language plpgsql
 stable security definer
 set search_path = public, pg_temp
as $function$
begin
  if not public.is_org_admin(org_id) and not exists (
    select 1 from public.organization_memberships om
    where om.user_id = auth.uid()
      and om.organization_id = org_id
      and om.is_active = true
  ) then
    raise exception 'Access denied: not a member of this organization';
  end if;

  return query
    select
      om.user_id,
      up.email::text,
      up.first_name::text,
      up.last_name::text,
      om.role,
      om.is_active,
      om.created_at,
      au.last_sign_in_at
    from public.organization_memberships om
    join public.user_profiles up on up.id = om.user_id
    left join auth.users au on au.id = om.user_id
    where om.organization_id = org_id
    order by om.is_active desc, up.first_name, up.last_name, up.email;
end;
$function$;

-- Change what someone is inside the organisation. Admins cannot change their
-- own role, so an organisation can never lose its last admin by accident.
create or replace function public.set_organization_member_role(
  org_id uuid,
  target_user_id uuid,
  new_role user_role
)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if not public.is_org_admin(org_id) then
    raise exception 'Access denied: only organization admins can change roles';
  end if;
  if new_role not in ('admin', 'user', 'technician') then
    raise exception 'Role must be admin, user or technician';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  update public.organization_memberships
  set role = new_role, updated_at = now()
  where organization_id = org_id and user_id = target_user_id;

  if not found then
    raise exception 'That user is not a member of this organization';
  end if;
end;
$function$;

-- Deactivate (or reactivate) a member. A deactivated membership hides the
-- organisation's data from that user once cross-organisation isolation lands
-- (HT-14 phase 2); until then it is what the Users page shows and what
-- is_org_admin honours. The auth account itself is left in place.
create or replace function public.set_organization_member_active(
  org_id uuid,
  target_user_id uuid,
  active boolean
)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if not public.is_org_admin(org_id) then
    raise exception 'Access denied: only organization admins can deactivate members';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot deactivate yourself';
  end if;

  update public.organization_memberships
  set is_active = active, updated_at = now()
  where organization_id = org_id and user_id = target_user_id;

  if not found then
    raise exception 'That user is not a member of this organization';
  end if;
end;
$function$;

-- Signed-in users only. The anon key is public (HT-14), so nothing here may be
-- callable with it.
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.list_organization_members(uuid) from public, anon;
revoke all on function public.set_organization_member_role(uuid, uuid, user_role) from public, anon;
revoke all on function public.set_organization_member_active(uuid, uuid, boolean) from public, anon;

grant execute on function public.is_org_admin(uuid) to authenticated, service_role;
grant execute on function public.list_organization_members(uuid) to authenticated, service_role;
grant execute on function public.set_organization_member_role(uuid, uuid, user_role) to authenticated, service_role;
grant execute on function public.set_organization_member_active(uuid, uuid, boolean) to authenticated, service_role;
