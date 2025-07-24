create type "public"."organization_status" as enum ('active', 'inactive', 'pending');

create type "public"."user_role" as enum ('user', 'admin', 'superuser');

create table "public"."organization_memberships" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "organization_id" uuid,
    "role" user_role default 'user'::user_role,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."organization_memberships" enable row level security;

create table "public"."organizations" (
    "id" uuid not null default gen_random_uuid(),
    "name" character varying(255) not null,
    "subdomain" character varying(100) not null,
    "domain" character varying(255),
    "status" organization_status default 'pending'::organization_status,
    "route53_hosted_zone_id" character varying(255),
    "vercel_project_id" character varying(255),
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."organizations" enable row level security;

create table "public"."user_profiles" (
    "id" uuid not null,
    "email" character varying(255) not null,
    "first_name" character varying(100),
    "last_name" character varying(100),
    "role" user_role default 'user'::user_role,
    "organization_id" uuid,
    "is_active" boolean default true,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
);


alter table "public"."user_profiles" enable row level security;

CREATE UNIQUE INDEX organization_memberships_pkey ON public.organization_memberships USING btree (id);

CREATE UNIQUE INDEX organization_memberships_user_id_organization_id_key ON public.organization_memberships USING btree (user_id, organization_id);

CREATE UNIQUE INDEX organizations_pkey ON public.organizations USING btree (id);

CREATE UNIQUE INDEX organizations_subdomain_key ON public.organizations USING btree (subdomain);

CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id);

alter table "public"."organization_memberships" add constraint "organization_memberships_pkey" PRIMARY KEY using index "organization_memberships_pkey";

alter table "public"."organizations" add constraint "organizations_pkey" PRIMARY KEY using index "organizations_pkey";

alter table "public"."user_profiles" add constraint "user_profiles_pkey" PRIMARY KEY using index "user_profiles_pkey";

alter table "public"."organization_memberships" add constraint "organization_memberships_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."organization_memberships" validate constraint "organization_memberships_organization_id_fkey";

alter table "public"."organization_memberships" add constraint "organization_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."organization_memberships" validate constraint "organization_memberships_user_id_fkey";

alter table "public"."organization_memberships" add constraint "organization_memberships_user_id_organization_id_key" UNIQUE using index "organization_memberships_user_id_organization_id_key";

alter table "public"."organizations" add constraint "organizations_subdomain_key" UNIQUE using index "organizations_subdomain_key";

alter table "public"."user_profiles" add constraint "user_profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_organization_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_superuser()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return exists (
    select 1 from user_profiles 
    where id = auth.uid() and role = 'superuser'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.user_profiles (id, email, first_name, last_name)
  values (new.id, new.email, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name');
  return new;
end;
$function$
;

grant delete on table "public"."organization_memberships" to "anon";

grant insert on table "public"."organization_memberships" to "anon";

grant references on table "public"."organization_memberships" to "anon";

grant select on table "public"."organization_memberships" to "anon";

grant trigger on table "public"."organization_memberships" to "anon";

grant truncate on table "public"."organization_memberships" to "anon";

grant update on table "public"."organization_memberships" to "anon";

grant delete on table "public"."organization_memberships" to "authenticated";

grant insert on table "public"."organization_memberships" to "authenticated";

grant references on table "public"."organization_memberships" to "authenticated";

grant select on table "public"."organization_memberships" to "authenticated";

grant trigger on table "public"."organization_memberships" to "authenticated";

grant truncate on table "public"."organization_memberships" to "authenticated";

grant update on table "public"."organization_memberships" to "authenticated";

grant delete on table "public"."organization_memberships" to "service_role";

grant insert on table "public"."organization_memberships" to "service_role";

grant references on table "public"."organization_memberships" to "service_role";

grant select on table "public"."organization_memberships" to "service_role";

grant trigger on table "public"."organization_memberships" to "service_role";

grant truncate on table "public"."organization_memberships" to "service_role";

grant update on table "public"."organization_memberships" to "service_role";

grant delete on table "public"."organizations" to "anon";

grant insert on table "public"."organizations" to "anon";

grant references on table "public"."organizations" to "anon";

grant select on table "public"."organizations" to "anon";

grant trigger on table "public"."organizations" to "anon";

grant truncate on table "public"."organizations" to "anon";

grant update on table "public"."organizations" to "anon";

grant delete on table "public"."organizations" to "authenticated";

grant insert on table "public"."organizations" to "authenticated";

grant references on table "public"."organizations" to "authenticated";

grant select on table "public"."organizations" to "authenticated";

grant trigger on table "public"."organizations" to "authenticated";

grant truncate on table "public"."organizations" to "authenticated";

grant update on table "public"."organizations" to "authenticated";

grant delete on table "public"."organizations" to "service_role";

grant insert on table "public"."organizations" to "service_role";

grant references on table "public"."organizations" to "service_role";

grant select on table "public"."organizations" to "service_role";

grant trigger on table "public"."organizations" to "service_role";

grant truncate on table "public"."organizations" to "service_role";

grant update on table "public"."organizations" to "service_role";

grant delete on table "public"."user_profiles" to "anon";

grant insert on table "public"."user_profiles" to "anon";

grant references on table "public"."user_profiles" to "anon";

grant select on table "public"."user_profiles" to "anon";

grant trigger on table "public"."user_profiles" to "anon";

grant truncate on table "public"."user_profiles" to "anon";

grant update on table "public"."user_profiles" to "anon";

grant delete on table "public"."user_profiles" to "authenticated";

grant insert on table "public"."user_profiles" to "authenticated";

grant references on table "public"."user_profiles" to "authenticated";

grant select on table "public"."user_profiles" to "authenticated";

grant trigger on table "public"."user_profiles" to "authenticated";

grant truncate on table "public"."user_profiles" to "authenticated";

grant update on table "public"."user_profiles" to "authenticated";

grant delete on table "public"."user_profiles" to "service_role";

grant insert on table "public"."user_profiles" to "service_role";

grant references on table "public"."user_profiles" to "service_role";

grant select on table "public"."user_profiles" to "service_role";

grant trigger on table "public"."user_profiles" to "service_role";

grant truncate on table "public"."user_profiles" to "service_role";

grant update on table "public"."user_profiles" to "service_role";

create policy "Superusers can view all memberships"
on "public"."organization_memberships"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superuser'::user_role)))));


create policy "Users can view their memberships"
on "public"."organization_memberships"
as permissive
for select
to public
using ((auth.uid() = user_id));


create policy "Superusers can insert organizations"
on "public"."organizations"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superuser'::user_role)))));


create policy "Superusers can update organizations"
on "public"."organizations"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superuser'::user_role)))));


create policy "Superusers can view all organizations"
on "public"."organizations"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superuser'::user_role)))));


create policy "Superusers can insert profiles"
on "public"."user_profiles"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM user_profiles user_profiles_1
  WHERE ((user_profiles_1.id = auth.uid()) AND (user_profiles_1.role = 'superuser'::user_role)))));


create policy "Superusers can update profiles"
on "public"."user_profiles"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles user_profiles_1
  WHERE ((user_profiles_1.id = auth.uid()) AND (user_profiles_1.role = 'superuser'::user_role)))));


create policy "Superusers can view all profiles"
on "public"."user_profiles"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profiles user_profiles_1
  WHERE ((user_profiles_1.id = auth.uid()) AND (user_profiles_1.role = 'superuser'::user_role)))));


create policy "Users can view their own profile"
on "public"."user_profiles"
as permissive
for select
to public
using ((auth.uid() = id));



