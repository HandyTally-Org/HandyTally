// One Supabase client for the whole app. Screens that import from lib/api
// historically got their own bare client, which sent no tenant header
// (HT-38 / HT-55) and ran a second auth session; keep this a re-export.
export { supabase } from './supabase';
