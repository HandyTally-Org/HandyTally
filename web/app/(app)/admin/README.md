# Admin Section

This directory contains the admin pages for the HandyTally application.

## User Management

The `users.tsx` file has been updated to pull data directly from Supabase's `auth.users` table instead of using a custom users table. This provides several benefits:

1. Single source of truth for user data
2. Direct access to authentication status (confirmed/pending)
3. Better integration with Supabase Auth features

### Implementation Details

- The User type has been updated to match the structure of auth.users
- User data is fetched using a custom RPC function (`get_all_users()`)
- The table now displays the following columns from auth.users:
  - UID (user id)
  - Display name (from user_metadata)
  - Email
  - Phone
  - Providers (from app_metadata)
  - Provider type (from app_metadata)
  - Created at
  - Last sign in at
- Admin actions (update, delete, confirm) use secure RPC functions

### Required SQL Functions

For this implementation to work, you need to set up several SQL functions in your Supabase project. These functions are defined in `database/auth_functions.sql` and include:

- `get_all_users()` - Retrieves all users from the auth.users table with all necessary fields
- `is_admin()` - Checks if the current user has admin privileges
- `admin_update_user_metadata(user_id, metadata)` - Updates a user's metadata
- `admin_update_user_email(user_id, new_email)` - Updates a user's email
- `admin_update_user_password(user_id, password)` - Updates a user's password
- `admin_delete_user(user_id)` - Deletes a user
- `admin_confirm_user(user_id)` - Confirms a user's email

See the README in the `database` directory for instructions on how to set up these functions.

### Security Considerations

- All admin functions include security checks to ensure only admin users can access them
- The functions use `SECURITY DEFINER` to run with elevated privileges
- User roles are determined by the 'role' field in user metadata

### UI Changes

- Updated the table schema to match the Supabase Auth dashboard
- Added helper function to extract provider information from app_metadata
- Improved display of user IDs with appropriate styling
- Removed the Role and Status columns as they're not part of the standard auth.users schema 