drop policy "Superusers can insert profiles" on "public"."user_profiles";

drop policy "Superusers can update profiles" on "public"."user_profiles";

drop policy "Superusers can view all profiles" on "public"."user_profiles";

create policy "Enable insert for superusers"
on "public"."user_profiles"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.role = 'superuser'::user_role)))));


create policy "Enable read access for superusers"
on "public"."user_profiles"
as permissive
for select
to public
using (((auth.uid() = id) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.role = 'superuser'::user_role) AND (up.id <> user_profiles.id))))));


create policy "Enable update for superusers"
on "public"."user_profiles"
as permissive
for update
to public
using (((auth.uid() = id) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.role = 'superuser'::user_role) AND (up.id <> user_profiles.id))))));



