# HandyTally — web app

The main HandyTally application: an [Expo](https://expo.dev) / React Native project using [Expo Router](https://docs.expo.dev/router/introduction) for file-based routing and [React Native Paper](https://reactnativepaper.com) for UI. It targets the web first (served as a static bundle by a Cloudflare Worker) and can be run on iOS and Android with the same code.

See the [root README](../README.md) for the overall architecture, database and edge-function setup.

## Run locally

```bash
cp .env.example .env      # fill in your Supabase URL and anon key
npm install
npx expo start --web      # or: npm run web
```

Other targets:

| Command | What it does |
| --- | --- |
| `npm start` | Expo dev tools; pick iOS simulator, Android emulator or Expo Go |
| `npm run ios` / `npm run android` | Start directly on a simulator / emulator |
| `npm test` | Jest (`jest-expo` preset) in watch mode |
| `npm run lint` | `expo lint` |
| `npx expo export --platform web` | Static bundle to `dist/` (what CI deploys) |

## Structure

```
app/
  _layout.tsx            Root layout: AuthProvider, Paper theme, gesture handler
  (auth)/                login.tsx, signup.tsx
  (app)/                 Authenticated area; _layout.tsx renders the sidebar + drawer
    index.tsx            Dashboard
    clients.tsx          Clients list; clients/[id].tsx detail
    jobs.tsx             Jobs list with Excel import/export; jobs/[id].tsx detail
    invoices.tsx         Invoices list; invoices/form.tsx editor; invoices/[id]/edit.tsx
    inventory.tsx        Materials
    labor.tsx            Labor entries
    schedule.tsx         Calendar
    admin/               company.tsx, users.tsx (admin role only)
components/              InvoiceForm, InvoiceDetails, JobForm, ClientForm, Sidebar, calendars, …
contexts/AuthContext.tsx Session state and the role gate applied at sign-in
lib/supabase.ts          supabase-js client
lib/api.ts               Data-access helpers
utils/invoiceHtml.ts     Single source of the invoice document HTML (screen, print, email)
utils/format.ts, date.ts Formatting helpers
styles/                  global.css, print.css
wrangler.jsonc           Cloudflare Worker config (serves dist/ with an SPA fallback)
```

## Environment

Variables prefixed `EXPO_PUBLIC_` are inlined into the bundle at build time. Copy `.env.example` and set:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase API URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_BASE_DOMAIN` | Root domain for organization subdomains |

Anything without the `EXPO_PUBLIC_` prefix is not available to the app.

## Conventions

- Screens live in `app/`; reusable pieces in `components/`. A component that is only used by one screen can live next to it.
- Talk to Supabase through the `supabase` client in `lib/supabase.ts`; wrap calls in `handleSupabaseOperation` so errors are surfaced consistently.
- Keep styles in `StyleSheet.create` at the bottom of the file; shared styles come from `styles.ts`.
- When changing the invoice document, edit `utils/invoiceHtml.ts` — do not fork the markup into the email function.

## Deployment

Every push to `master` runs the `web-deploy` job in `.github/workflows/ci.yml`: `npm ci` → `npx expo export --platform web` → `wrangler deploy`, publishing `dist/` as the `handytally-web` Cloudflare Worker defined in [`wrangler.jsonc`](wrangler.jsonc). The `EXPO_PUBLIC_*` variables above are repository variables in GitHub Actions; the deploy needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
