import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { customStorage } from './customStorage';
import { tenantSubdomain } from './tenant';

// Self-hosted Supabase instance. The URL and anon key are public by
// construction (they ship in the bundle), so the production values double as
// the fallback for a checkout without a .env (DI-05, HT-38). CI sets the same
// variables from repository variables when they exist.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://supabase.axiappm.com';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2NTc3MDAwMCwiZXhwIjo0OTIxNDQzNjAwLCJyb2xlIjoiYW5vbiJ9.gO1H0XzlOU2T9ayabs3A5k6RsNLqqCUv93IG8k3wflk';

// Check if we're in a browser environment
const isServer = typeof window === 'undefined';

// HT-38: tell the database which customer host this browser is on. The
// auto_set_organization_id trigger reads the header (via PostgREST's
// request.headers setting) to stamp new rows with that organization, after
// checking the caller is a member of it. No header on the apex, www,
// localhost, the workers.dev URL or native, where the old best-membership
// behaviour applies.
const tenantHeaders: Record<string, string> = tenantSubdomain
  ? { 'x-tenant-subdomain': tenantSubdomain }
  : {};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServer ? customStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'HandyTally Mobile App',
      ...tenantHeaders,
    },
  },
});

// Helper function to handle Supabase operations
export async function handleSupabaseOperation<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  errorMessage: string
): Promise<T> {
  try {
    const { data, error } = await operation();

    if (error) {
      console.error(`Supabase error: ${errorMessage}`, error);
      throw new Error(`${errorMessage}: ${error.message || JSON.stringify(error)}`);
    }

    if (data === null) {
      console.error(`No data returned: ${errorMessage}`);
      throw new Error(`${errorMessage}: No data returned from operation`);
    }

    return data as T;
  } catch (error: any) {
    console.error(`Error in Supabase operation: ${errorMessage}`, error);
    throw error;
  }
}

// Function to temporarily disable RLS for testing
export async function disableRLS() {
  try {
    console.log('Attempting to disable RLS for testing...');
    const { error } = await supabase.rpc('disable_rls');
    if (error) {
      console.error('Error disabling RLS:', error);
    } else {
      console.log('RLS disabled successfully');
    }
  } catch (error) {
    console.error('Error in disableRLS:', error);
  }
}
