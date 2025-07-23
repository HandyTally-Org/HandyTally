import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { customStorage } from './customStorage';

// Replace with your Supabase URL and anon key
const supabaseUrl = 'https://evgopevhaapzyvqulwjb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Z29wZXZoYWFwenl2cXVsd2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA0MzEzODMsImV4cCI6MjA1NjAwNzM4M30.asYGfJtuoNoJ6s3sOYUc0FRAwHLAVTq1XWqLdGsOZdA';

// Check if we're in a browser environment
const isServer = typeof window === 'undefined';

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