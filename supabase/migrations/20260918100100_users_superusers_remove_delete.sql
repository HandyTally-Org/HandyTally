-- HT-65 (A, D): superusers on every Users page, Remove from organisation,
-- and a database that lets an account be deleted.
--
-- A. list_organization_members() now also returns the active superusers who
--    hold no membership row in the organisation, as role 'superuser'. They
--    never get a membership row inserted; the platform account is visible on
--    every organisation's Users page because it can act on every one.
--    Superuser accounts can never be deleted, deactivated or demoted: a
--    BEFORE trigger on auth.users and on user_profiles refuses it, on top of
--    the delete-user edge function's own check.
--
-- D. remove_organization_member() deletes one membership row (SECURITY
--    DEFINER, admin-gated, with the same self / superuser / last-admin
--    guards as the other member RPCs). Deleting the account itself is the
--    delete-user edge function (service role, Auth admin API); the cascade
--    from auth.users then removes the profile and memberships. Every foreign
--    key that still said NO ACTION is switched to ON DELETE SET NULL so a
--    delete can never fail on history rows:
--        audit_log.user_id, organization_memberships.created_by,
--        job_costs.created_by
--    (jobs.created_by, jobs.assigned_to, invoices.created_by, notes.created_by
--    and organization_settings.updated_by were already SET NULL.)

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- A. Superusers on the member list
-- ---------------------------------------------------------------------------
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
    select x.user_id, x.email, x.first_name, x.last_name, x.role, x.is_active, x.joined_at, x.last_sign_in_at
    from (
      -- real memberships
      select
        om.user_id,
        up.email::text as email,
        up.first_name::text as first_name,
        up.last_name::text as last_name,
        om.role,
        om.is_active,
        om.created_at as joined_at,
        au.last_sign_in_at,
        0 as sort_group
      from public.organization_memberships om
      join public.user_profiles up on up.id = om.user_id
      left join auth.users au on au.id = om.user_id
      where om.organization_id = org_id

      union all

      -- platform superusers with no membership row here (HT-65)
      select
        up.id as user_id,
        up.email::text as email,
        up.first_name::text as first_name,
        up.last_name::text as last_name,
        'superuser'::user_role as role,
        true as is_active,
        up.created_at as joined_at,
        au.last_sign_in_at,
        1 as sort_group
      from public.user_profiles up
      left join auth.users au on au.id = up.id
      where up.role = 'superuser'
        and up.is_active = true
        and not exists (
          select 1 from public.organization_memberships om2
          where om2.user_id = up.id and om2.organization_id = org_id
        )
    ) x
    order by x.is_active desc, x.sort_group, x.first_name, x.last_name, x.email;
end;
$function$;

-- Superuser accounts are platform-wide: never deleted, deactivated or demoted
-- through any path, including the Auth admin API and psql by mistake.
create or replace function public.protect_superuser_accounts()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.user_profiles up
      where up.id = old.id and up.role = 'superuser'
    ) then
      raise exception 'Superuser accounts are platform-wide and cannot be deleted'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE on user_profiles
  if old.role = 'superuser' and (new.is_active = false or new.role <> 'superuser') then
    raise exception 'Superuser accounts cannot be deactivated or demoted'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_superuser_auth_delete on auth.users;
create trigger protect_superuser_auth_delete
  before delete on auth.users
  for each row execute function public.protect_superuser_accounts();

drop trigger if exists protect_superuser_profile_delete on public.user_profiles;
create trigger protect_superuser_profile_delete
  before delete on public.user_profiles
  for each row execute function public.protect_superuser_accounts();

drop trigger if exists protect_superuser_profile_update on public.user_profiles;
create trigger protect_superuser_profile_update
  before update of is_active, role on public.user_profiles
  for each row execute function public.protect_superuser_accounts();

-- ---------------------------------------------------------------------------
-- D. Remove from organisation
-- ---------------------------------------------------------------------------
create or replace function public.remove_organization_member(
  org_id uuid,
  target_user_id uuid
)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if not public.is_org_admin(org_id) then
    raise exception 'Access denied: only organization admins can remove members';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;
  if exists (
    select 1 from public.user_profiles up
    where up.id = target_user_id and up.role = 'superuser'
  ) then
    raise exception 'Superuser accounts are platform-wide and cannot be removed';
  end if;
  -- Never leave an organisation without an active admin.
  if exists (
    select 1 from public.organization_memberships om
    where om.organization_id = org_id
      and om.user_id = target_user_id
      and om.role = 'admin'
      and om.is_active = true
  ) and not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = org_id
      and om.user_id <> target_user_id
      and om.role = 'admin'
      and om.is_active = true
  ) then
    raise exception 'That user is the only admin of this organization';
  end if;

  delete from public.organization_memberships
  where organization_id = org_id and user_id = target_user_id;

  if not found then
    raise exception 'That user is not a member of this organization';
  end if;
end;
$function$;

revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- D. Deleting an account must not fail on history rows
-- ---------------------------------------------------------------------------
alter table public.audit_log alter column user_id drop not null;
alter table public.audit_log drop constraint if exists audit_log_user_id_fkey;
alter table public.audit_log
  add constraint audit_log_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.organization_memberships alter column created_by drop not null;
alter table public.organization_memberships drop constraint if exists organization_memberships_created_by_fkey;
alter table public.organization_memberships
  add constraint organization_memberships_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.job_costs alter column created_by drop not null;
alter table public.job_costs drop constraint if exists job_costs_created_by_fkey;
alter table public.job_costs
  add constraint job_costs_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
