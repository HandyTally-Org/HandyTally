create schema if not exists "admin";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION admin.add_user_to_organization(target_user_id uuid, org_id uuid, user_role user_role)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  membership_id uuid;
  caller_role user_role;
BEGIN
  -- SECURITY CHECK: Verify caller permissions
  SELECT role INTO caller_role 
  FROM public.user_profiles 
  WHERE id = auth.uid() AND is_active = true;

  IF caller_role = 'superuser' THEN
    -- Superusers can do anything
    NULL;
  ELSIF caller_role = 'admin' AND EXISTS (
    SELECT 1 FROM public.organization_memberships 
    WHERE user_id = auth.uid() 
      AND organization_id = org_id 
      AND role = 'admin' 
      AND is_active = true
  ) THEN
    -- Admins can manage their organization, but can't create superusers
    IF user_role = 'superuser' THEN
      RAISE EXCEPTION 'Access denied: Organization admins cannot create superuser memberships';
    END IF;
  ELSE
    RAISE EXCEPTION 'Access denied: Insufficient permissions to manage organization memberships';
  END IF;

  -- Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  -- Verify organization exists
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  -- Insert or update membership
  INSERT INTO public.organization_memberships (
    user_id,
    organization_id,
    role,
    is_active,
    created_by
  ) VALUES (
    target_user_id,
    org_id,
    user_role,
    true,
    auth.uid()
  )
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO membership_id;

  RETURN membership_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION admin.create_organization_user(user_email text, user_password text, org_id uuid, user_role user_role, first_name text DEFAULT ''::text, last_name text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_user_id uuid;
  caller_role user_role;
BEGIN
  -- SECURITY CHECK: Verify caller permissions
  SELECT role INTO caller_role 
  FROM public.user_profiles 
  WHERE id = auth.uid() AND is_active = true;

  IF caller_role = 'superuser' THEN
    -- Superusers can create anyone
    NULL;
  ELSIF caller_role = 'admin' AND EXISTS (
    SELECT 1 FROM public.organization_memberships 
    WHERE user_id = auth.uid() 
      AND organization_id = org_id 
      AND role = 'admin' 
      AND is_active = true
  ) THEN
    -- Admins can create users/admins in their organization
    IF user_role = 'superuser' THEN
      RAISE EXCEPTION 'Access denied: Organization admins cannot create superusers';
    END IF;
  ELSE
    RAISE EXCEPTION 'Access denied: Insufficient permissions to create users in this organization';
  END IF;

  -- Verify organization exists  
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  -- Check if email already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    RAISE EXCEPTION 'User with this email already exists';
  END IF;

  new_user_id := gen_random_uuid();

  -- Create the auth user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    NOW(),
    json_build_object('first_name', first_name, 'last_name', last_name),
    NOW(),
    NOW()
  );

  -- Create the user profile
  INSERT INTO public.user_profiles (
    id,
    email,
    first_name,
    last_name,
    role,
    is_active
  ) VALUES (
    new_user_id,
    user_email,
    first_name,
    last_name,
    CASE WHEN user_role = 'superuser' THEN 'superuser' ELSE 'user' END,
    true
  );

  -- Create organization membership (unless it's a superuser)
  IF user_role != 'superuser' THEN
    INSERT INTO public.organization_memberships (
      user_id,
      organization_id,
      role,
      is_active,
      created_by
    ) VALUES (
      new_user_id,
      org_id,
      user_role,
      true,
      auth.uid()
    );
  END IF;

  RETURN new_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION admin.create_superuser(user_email text, user_password text, first_name text DEFAULT ''::text, last_name text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_user_id uuid;
BEGIN
  -- SECURITY CHECK: Verify the calling user is a superuser
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND role = 'superuser' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: Only superusers can create superuser accounts';
  END IF;

  new_user_id := gen_random_uuid();

  -- Create the auth user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    NOW(),
    json_build_object('first_name', first_name, 'last_name', last_name),
    NOW(),
    NOW()
  );

  -- Create the superuser profile
  INSERT INTO public.user_profiles (
    id,
    email,
    first_name,
    last_name,
    role,
    is_active
  ) VALUES (
    new_user_id,
    user_email,
    first_name,
    last_name,
    'superuser',
    true
  );

  -- Log the action
  INSERT INTO public.audit_log (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'CREATE_SUPERUSER', 'user_profiles', new_user_id, 
          json_build_object('email', user_email, 'role', 'superuser'));

  RETURN new_user_id;
END;
$function$
;


drop policy "Enable insert for superusers" on "public"."user_profiles";

drop policy "Enable read access for superusers" on "public"."user_profiles";

drop policy "Enable update for superusers" on "public"."user_profiles";

drop policy "Users can view their own profile" on "public"."user_profiles";

create table "public"."audit_log" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "action" text not null,
    "table_name" text not null,
    "record_id" uuid,
    "old_values" jsonb,
    "new_values" jsonb,
    "created_at" timestamp with time zone default now()
);


alter table "public"."audit_log" enable row level security;

alter table "public"."organization_memberships" add column "created_by" uuid;

alter table "public"."organization_memberships" add column "is_active" boolean not null default true;

alter table "public"."organization_memberships" add column "updated_at" timestamp with time zone default timezone('utc'::text, now());

alter table "public"."organizations" add column "vercel_deployment_url" text;

CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id);

CREATE INDEX idx_org_memberships_active ON public.organization_memberships USING btree (is_active);

CREATE INDEX idx_org_memberships_org_id ON public.organization_memberships USING btree (organization_id);

CREATE INDEX idx_org_memberships_user_id ON public.organization_memberships USING btree (user_id);

alter table "public"."audit_log" add constraint "audit_log_pkey" PRIMARY KEY using index "audit_log_pkey";

alter table "public"."audit_log" add constraint "audit_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."audit_log" validate constraint "audit_log_user_id_fkey";

alter table "public"."organization_memberships" add constraint "organization_memberships_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."organization_memberships" validate constraint "organization_memberships_created_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_values)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_organizations(target_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(org_id uuid, org_name text, user_role user_role, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  -- Only return data if user can access it (superuser or own data)
  SELECT 
    o.id,
    o.name,
    om.role,
    om.is_active
  FROM public.organizations o
  JOIN public.organization_memberships om ON o.id = om.organization_id
  WHERE om.user_id = target_user_id
    AND om.is_active = true
    AND (
      target_user_id = auth.uid() OR  -- Own data
      EXISTS(SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superuser' AND is_active = true)  -- Superuser
    )
  UNION ALL
  -- Superusers can access all organizations
  SELECT 
    o.id,
    o.name,
    'superuser'::user_role,
    true
  FROM public.organizations o
  WHERE target_user_id = auth.uid()  -- Only for requesting user
    AND EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = target_user_id AND role = 'superuser' AND is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships 
      WHERE user_id = target_user_id AND organization_id = o.id
    );
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_self_superuser_promotion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Only run checks on UPDATE operations (INSERT doesn't have OLD record)
  IF TG_OP = 'UPDATE' THEN
    -- Prevent users from making themselves superuser unless they already are one
    IF OLD.role != 'superuser' AND NEW.role = 'superuser' AND NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'Users cannot promote themselves to superuser';
    END IF;
    
    -- Prevent users from deactivating themselves
    IF OLD.is_active = true AND NEW.is_active = false AND NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'Users cannot deactivate themselves';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.test_admin_access()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() AND role = 'superuser' AND is_active = true
    ) THEN 'SUPERUSER_ACCESS'
    WHEN EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    ) THEN 'ADMIN_ACCESS'
    WHEN EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() AND is_active = true
    ) THEN 'USER_ACCESS'
    ELSE 'NO_ACCESS'
  END;
$function$
;

grant delete on table "public"."audit_log" to "anon";

grant insert on table "public"."audit_log" to "anon";

grant references on table "public"."audit_log" to "anon";

grant select on table "public"."audit_log" to "anon";

grant trigger on table "public"."audit_log" to "anon";

grant truncate on table "public"."audit_log" to "anon";

grant update on table "public"."audit_log" to "anon";

grant delete on table "public"."audit_log" to "authenticated";

grant insert on table "public"."audit_log" to "authenticated";

grant references on table "public"."audit_log" to "authenticated";

grant select on table "public"."audit_log" to "authenticated";

grant trigger on table "public"."audit_log" to "authenticated";

grant truncate on table "public"."audit_log" to "authenticated";

grant update on table "public"."audit_log" to "authenticated";

grant delete on table "public"."audit_log" to "service_role";

grant insert on table "public"."audit_log" to "service_role";

grant references on table "public"."audit_log" to "service_role";

grant select on table "public"."audit_log" to "service_role";

grant trigger on table "public"."audit_log" to "service_role";

grant truncate on table "public"."audit_log" to "service_role";

grant update on table "public"."audit_log" to "service_role";

create policy "Superusers can manage audit logs"
on "public"."audit_log"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superuser'::user_role) AND (user_profiles.is_active = true)))));


create policy "Superusers can delete organizations"
on "public"."organizations"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superuser'::user_role) AND (user_profiles.is_active = true)))));


create policy "Superusers can manage organizations"
on "public"."organizations"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superuser'::user_role) AND (user_profiles.is_active = true)))));


create policy "Superusers can insert profiles"
on "public"."user_profiles"
as permissive
for insert
to public
with check ((auth.user_role() = 'superuser'::user_role));


create policy "Superusers can read all profiles"
on "public"."user_profiles"
as permissive
for select
to public
using ((auth.user_role() = 'superuser'::user_role));


create policy "Superusers can update all profiles"
on "public"."user_profiles"
as permissive
for update
to public
using ((auth.user_role() = 'superuser'::user_role));


create policy "Users can read own profile"
on "public"."user_profiles"
as permissive
for select
to public
using ((auth.uid() = id));


create policy "Users can update own profile"
on "public"."user_profiles"
as permissive
for update
to public
using ((auth.uid() = id));


CREATE TRIGGER audit_organizations AFTER INSERT OR DELETE OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_user_profiles AFTER INSERT OR DELETE OR UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER prevent_self_promotion BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION prevent_self_superuser_promotion();


