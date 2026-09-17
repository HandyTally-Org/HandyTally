-- HT-52: custom field values on clients, materials and services.
--
-- An admin defines fields per section in Admin > Settings; the definitions
-- live in organization_settings.custom_fields (HT-50) as
--   { "<section>": [{ key, label, type, required, options? }, ...] }
-- and every record of that section stores its values here, keyed by the
-- definition's key:
--   custom_fields = { "po_number": "4471", "site_contact": "Dana" }
--
-- Values carry no organisation id of their own: they sit on rows that
-- already have one, under the tenant_scoped policy HT-55 put on all three
-- tables. No GIN index: filtering on custom fields is out of v1 and an
-- unused jsonb index is pure write cost.
--
-- Deleting a definition hides the field but leaves values in place, so
-- re-adding a field with the same key shows them again. Removing the data
-- is a separate, explicit action: purge_custom_field_values() strips one key
-- from every record of a section in the caller's organisation, admins only.
-- jobs and invoices get their column with HT-53.

begin;

alter table public.clients   add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.materials add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.services  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

comment on column public.clients.custom_fields   is 'HT-52: values of the organisation''s custom fields, keyed by field key.';
comment on column public.materials.custom_fields is 'HT-52: values of the organisation''s custom fields, keyed by field key.';
comment on column public.services.custom_fields  is 'HT-52: values of the organisation''s custom fields, keyed by field key.';

create or replace function public.purge_custom_field_values(p_organization_id uuid, p_section text, p_key text)
 returns integer
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  affected integer;
begin
  if not public.is_org_admin(p_organization_id) then
    raise exception 'Only organization admins can delete custom field data' using errcode = '42501';
  end if;
  if p_key is null or p_key = '' then
    raise exception 'A field key is required' using errcode = '22023';
  end if;

  case p_section
    when 'clients' then
      update public.clients set custom_fields = custom_fields - p_key
       where organization_id = p_organization_id and custom_fields ? p_key;
    when 'materials' then
      update public.materials set custom_fields = custom_fields - p_key
       where organization_id = p_organization_id and custom_fields ? p_key;
    when 'services' then
      update public.services set custom_fields = custom_fields - p_key
       where organization_id = p_organization_id and custom_fields ? p_key;
    else
      raise exception 'Unknown custom field section "%"', p_section using errcode = '22023';
  end case;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.purge_custom_field_values(uuid, text, text) from public;
grant execute on function public.purge_custom_field_values(uuid, text, text) to authenticated, service_role;

commit;
