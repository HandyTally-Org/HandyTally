-- HT-65: audit_trigger() must work from any session search_path.
--
-- public.audit_trigger() (bound to user_profiles as audit_user_profiles) was
-- created without a search_path and inserts into an unqualified audit_log.
-- Every write the app makes runs with public on the search_path, so it never
-- failed -- until delete-user (HT-65) deleted an auth.users row through the
-- Auth admin API: GoTrue runs with search_path = auth, the delete cascades
-- into public.user_profiles, the trigger fires and fails with
--   ERROR: relation "audit_log" does not exist (SQLSTATE 42P01)
-- and GoTrue reports "Database error deleting user". Found live on
-- 2026-09-17 with the first real account deletion.
--
-- Same body, schema-qualified and pinned to public, as every other
-- SECURITY DEFINER function in this schema already is.

set check_function_bodies = off;

create or replace function public.audit_trigger()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (user_id, action, table_name, record_id, new_values)
    values (auth.uid(), tg_op, tg_table_name, new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (user_id, action, table_name, record_id, old_values, new_values)
    values (auth.uid(), tg_op, tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (user_id, action, table_name, record_id, old_values)
    values (auth.uid(), tg_op, tg_table_name, old.id, to_jsonb(old));
    return old;
  end if;
  return coalesce(new, old);
end;
$function$;
