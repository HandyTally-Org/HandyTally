# HandyTally — admin app

Superuser console for operating HandyTally across tenants. It is a small Expo / React Navigation app that talks to the same Supabase project as the main web app.

Only users whose `user_profiles.role` is `superuser` and `is_active` can sign in.

## What it does

- **Dashboard** — total users, organizations and active organizations at a glance
- **Organizations** — create a new organization; this calls the `create-organization` edge function, which validates the subdomain and inserts the row; the wildcard Cloudflare route serves the new host with no further provisioning
- **Users** — list, create and edit users and their organization memberships

## Run locally

```bash
cp .env.example .env      # Supabase URL and anon key
npm install
npx expo start --web
```

## Structure

```
App.tsx                   Entry: auth gate + navigator
src/
  navigation/AppNavigator.tsx
  screens/                Login, Dashboard, Organizations, Users
  components/             OrganizationForm, UserForm, UserList, ui/*
  hooks/                  useAuth, useOrganizations, useUsers
  services/supabase.ts    supabase-js client (reads EXPO_PUBLIC_* vars)
  services/organizations.ts
  types/                  Shared TypeScript types
  utils/constants.ts
```

## Environment

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase API URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

The service-role key is **never** used here; privileged work happens inside the `create-organization` edge function, which checks the caller's role before acting.
