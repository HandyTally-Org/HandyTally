-- HT-46: apply an Excel import of the Users page in one transaction.
--
-- The sheet is validated in the browser first (web/utils/userImport.ts) and
-- shown as a preview; on confirm the page calls this function with the
-- membership changes and removals. Everything here either applies in full or
-- raises and changes nothing, so a sheet with one bad row leaves the
-- organisation untouched. Invitations of new addresses and the deletion of
-- accounts left with no membership happen afterwards through the invite-user
-- and delete-user edge functions (they need the service role); this function
-- returns how many memberships each removed user still has so the page knows
-- which accounts to delete.
--
-- Guards, all enforced here regardless of what the sheet says:
--   - caller must be an admin of org_id (or a superuser)
--   - the caller's own row cannot be removed, deactivated or re-roled
--   - superuser accounts cannot be changed or removed
--   - every row must be a member of this organisation
--   - the organisation must keep at least one active admin
--
-- updates: [{ user_id, role?, is_active?, first_name?, last_name? }, ...]
-- removals: user ids whose membership in org_id is deleted

set check_function_bodies = off;

create or replace function public.apply_user_import(
  org_id uuid,
  updates jsonb default '[]'::jsonb,
  removals uuid[] default '{}'::uuid[]
)
 returns table (user_id uuid, memberships_left integer)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  u jsonb;
  target uuid;
  new_role text;
  new_active boolean;
begin
  if not public.is_org_admin(org_id) then
    raise exception 'Access denied: only organization admins can import users';
  end if;

  -- Removals -----------------------------------------------------------------
  foreach target in array coalesce(removals, '{}'::uuid[]) loop
    if target = auth.uid() then
      raise exception 'You cannot remove yourself';
    end if;
    if exists (select 1 from public.user_profiles up where up.id = target and up.role = 'superuser') then
      raise exception 'Superuser accounts are platform-wide and cannot be removed';
    end if;
    if not exists (
      select 1 from public.organization_memberships om
      where om.organization_id = org_id and om.user_id = target
    ) then
      raise exception 'User % is not a member of this organization', target;
    end if;
  end loop;

  -- Updates ------------------------------------------------------------------
  for u in select value from jsonb_array_elements(coalesce(updates, '[]'::jsonb)) loop
    target := (u->>'user_id')::uuid;
    if target is null then
      raise exception 'An update row has no user_id';
    end if;
    if exists (select 1 from public.user_profiles up where up.id = target and up.role = 'superuser') then
      raise exception 'Superuser accounts cannot be changed by an import';
    end if;
    if not exists (
      select 1 from public.organization_memberships om
      where om.organization_id = org_id and om.user_id = target
    ) then
      raise exception 'User % is not a member of this organization', target;
    end if;

    new_role := u->>'role';
    if new_role is not null then
      if new_role not in ('admin', 'user', 'technician') then
        raise exception 'Role must be admin, user or technician';
      end if;
      if target = auth.uid() then
        raise exception 'You cannot change your own role';
      end if;
      update public.organization_memberships om
      set role = new_role::user_role, updated_at = now()
      where om.organization_id = org_id and om.user_id = target;
    end if;

    if u ? 'is_active' then
      new_active := (u->>'is_active')::boolean;
      if target = auth.uid() and new_active = false then
        raise exception 'You cannot deactivate yourself';
      end if;
      update public.organization_memberships om
      set is_active = new_active, updated_at = now()
      where om.organization_id = org_id and om.user_id = target;
    end if;

    if (u ? 'first_name') or (u ? 'last_name') then
      update public.user_profiles up
      set first_name = coalesce(u->>'first_name', up.first_name),
          last_name = coalesce(u->>'last_name', up.last_name),
          updated_at = now()
      where up.id = target;
    end if;
  end loop;

  delete from public.organization_memberships om
  where om.organization_id = org_id
    and om.user_id = any(coalesce(removals, '{}'::uuid[]));

  -- Never leave the organisation without someone who can administer it.
  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = org_id and om.role = 'admin' and om.is_active = true
  ) then
    raise exception 'The import would leave this organization without an active admin';
  end if;

  return query
    select r.uid,
           (select count(*)::integer from public.organization_memberships om where om.user_id = r.uid)
    from unnest(coalesce(removals, '{}'::uuid[])) as r(uid);
end;
$function$;

revoke all on function public.apply_user_import(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.apply_user_import(uuid, jsonb, uuid[]) to authenticated, service_role;
