-- Function to get all users from auth.users
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS SETOF json
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the current user has admin privileges
  IF (SELECT is_admin() = FALSE) THEN
    RAISE EXCEPTION 'Only administrators can access user data';
  END IF;

  RETURN QUERY
  SELECT json_build_object(
    'id', au.id,
    'email', au.email,
    'phone', au.phone,
    'raw_user_meta_data', au.raw_user_meta_data,
    'raw_app_meta_data', au.raw_app_meta_data,
    'created_at', au.created_at,
    'last_sign_in_at', au.last_sign_in_at,
    'email_confirmed_at', au.email_confirmed_at
  )
  FROM auth.users au
  ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to check if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  user_role text;
BEGIN
  -- Get the current user's ID
  current_user_id := auth.uid();
  
  -- If no user is logged in, return false
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get the user's role from metadata
  SELECT (raw_user_meta_data->>'role')::text INTO user_role
  FROM auth.users
  WHERE id = current_user_id;
  
  -- Return true if the user is an admin
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql;

-- Function to update user metadata
CREATE OR REPLACE FUNCTION admin_update_user_metadata(user_id uuid, metadata jsonb)
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the current user has admin privileges
  IF (SELECT is_admin() = FALSE) THEN
    RAISE EXCEPTION 'Only administrators can update user metadata';
  END IF;

  -- Update the user's metadata
  UPDATE auth.users
  SET raw_user_meta_data = metadata
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update user email
CREATE OR REPLACE FUNCTION admin_update_user_email(user_id uuid, new_email text)
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the current user has admin privileges
  IF (SELECT is_admin() = FALSE) THEN
    RAISE EXCEPTION 'Only administrators can update user email';
  END IF;

  -- Update the user's email
  UPDATE auth.users
  SET email = new_email
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update user password
CREATE OR REPLACE FUNCTION admin_update_user_password(user_id uuid, password text)
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the current user has admin privileges
  IF (SELECT is_admin() = FALSE) THEN
    RAISE EXCEPTION 'Only administrators can update user password';
  END IF;

  -- Update the user's password
  UPDATE auth.users
  SET encrypted_password = crypt(password, gen_salt('bf'))
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to delete a user
CREATE OR REPLACE FUNCTION admin_delete_user(user_id uuid)
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the current user has admin privileges
  IF (SELECT is_admin() = FALSE) THEN
    RAISE EXCEPTION 'Only administrators can delete users';
  END IF;

  -- Delete the user
  DELETE FROM auth.users
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to confirm a user's email
CREATE OR REPLACE FUNCTION admin_confirm_user(user_id uuid)
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the current user has admin privileges
  IF (SELECT is_admin() = FALSE) THEN
    RAISE EXCEPTION 'Only administrators can confirm users';
  END IF;

  -- Confirm the user's email
  UPDATE auth.users
  SET email_confirmed_at = CURRENT_TIMESTAMP
  WHERE id = user_id AND email_confirmed_at IS NULL;
END;
$$ LANGUAGE plpgsql; 