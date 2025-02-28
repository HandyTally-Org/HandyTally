# Supabase SQL Functions Setup

This directory contains SQL files that need to be executed in the Supabase SQL Editor to set up the necessary database functions and tables.

## Setting Up Auth Functions

The `auth_functions.sql` file contains functions that allow admin users to interact with the Supabase Auth system. These functions are necessary for the User Management page to work properly.

### How to Set Up

1. Log in to your Supabase dashboard
2. Go to the SQL Editor
3. Create a new query
4. Copy and paste the contents of `auth_functions.sql` into the query editor
5. Run the query

### Functions Included

- `get_all_users()` - Retrieves all users from the auth.users table, including:
  - id
  - email
  - phone
  - raw_user_meta_data
  - raw_app_meta_data
  - created_at
  - last_sign_in_at
  - email_confirmed_at
- `is_admin()` - Checks if the current user has admin privileges
- `admin_update_user_metadata(user_id, metadata)` - Updates a user's metadata
- `admin_update_user_email(user_id, new_email)` - Updates a user's email
- `admin_update_user_password(user_id, password)` - Updates a user's password
- `admin_delete_user(user_id)` - Deletes a user
- `admin_confirm_user(user_id)` - Confirms a user's email

## Important Notes

- These functions use `SECURITY DEFINER` which means they run with the privileges of the user who created them (typically the database owner).
- The functions include security checks to ensure only admin users can access them.
- You may need to adjust the `is_admin()` function if your application uses a different way to determine admin status.
- The `get_all_users()` function has been updated to include phone and app_metadata fields to match the Supabase Auth dashboard.

## Troubleshooting

If you encounter errors when running these functions:

1. Make sure you have the necessary permissions to create functions in your Supabase project
2. Check that the auth.users table exists and has the expected structure
3. Verify that your application is correctly setting the 'role' field in user metadata
4. If you get "function does not exist" errors, make sure all functions are created in the correct order (is_admin() should be created before other functions that use it) 