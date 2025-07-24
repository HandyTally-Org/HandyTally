import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// Add this test function
export const testSupabaseConnection = async () => {
    try {
        const { data, error } = await supabase.from('organizations').select('count');
        console.log('Supabase test:', { data, error });
        return { success: !error };
    } catch (err) {
        console.error('Supabase connection failed:', err);
        return { success: false };
    }
};