set check_function_bodies = off;

CREATE OR REPLACE FUNCTION auth.user_is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT is_active FROM public.user_profiles WHERE id = auth.uid()),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION auth.user_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()),
    'user'::user_role
  );
$function$
;


