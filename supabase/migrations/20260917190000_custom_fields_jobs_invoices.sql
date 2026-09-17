-- HT-53: custom field values on jobs and invoices, completing the set HT-52
-- started on clients, materials and services. Same shape, same column, same
-- rules: definitions live in organization_settings.custom_fields under the
-- "jobs" / "invoices" keys, values sit on the record keyed by the
-- definition's key, no GIN index (filtering is out of v1).
--
-- Estimates and invoices are the same row (invoices.status cycles estimate
-- -> work_order -> sent/...), so one invoice carries one set of custom
-- field values across every stage - a field defined for "Invoices" applies
-- to the estimate too, by design (confirmed on the ticket).
--
-- purge_custom_field_values() is extended to the two new sections rather
-- than duplicated; admins only, same as HT-52.

begin;

alter table public.jobs     add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.invoices add column if not exists custom_fields jsonb not null default '{}'::jsonb;

comment on column public.jobs.custom_fields     is 'HT-53: values of the organisation''s custom fields, keyed by field key.';
comment on column public.invoices.custom_fields is 'HT-53: values of the organisation''s custom fields, keyed by field key. Shared by every status the row passes through (estimate, work order, sent, ...).';

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
    when 'jobs' then
      update public.jobs set custom_fields = custom_fields - p_key
       where organization_id = p_organization_id and custom_fields ? p_key;
    when 'invoices' then
      update public.invoices set custom_fields = custom_fields - p_key
       where organization_id = p_organization_id and custom_fields ? p_key;
    else
      raise exception 'Unknown custom field section "%"', p_section using errcode = '22023';
  end case;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

commit;
