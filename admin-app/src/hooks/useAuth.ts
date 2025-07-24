// src/hooks/useAuth.ts - Simplified for Admin-Only App
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';

export const useAuth = () => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchUserProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event);
                if (session?.user) {
                    fetchUserProfile(session.user.id);
                } else {
                    setUser(null);
                    setLoading(false);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const fetchUserProfile = async (userId: string) => {
        try {
            console.log('Fetching admin profile for:', userId);

            // Get user profile
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (profileError) {
                console.error('Profile fetch error:', profileError);
                throw profileError;
            }

            if (!profile) {
                console.error('No profile found for user:', userId);
                setLoading(false);
                return;
            }

            // Verify user is authorized to use admin app
            if (profile.role !== 'superuser') {
                console.error('Access denied: User is not a superuser');
                await signOut(); // Force logout if not superuser
                return;
            }

            setUser(profile);
            console.log('Admin profile loaded:', profile);
        } catch (error) {
            console.error('Error fetching user profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const signIn = async (email: string, password: string) => {
        console.log('Attempting admin sign in for:', email);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.error('Sign in error:', error);
        } else {
            console.log('Sign in successful');
        }

        return { data, error };
    };

    const signOut = async () => {
        console.log('Admin signing out...');
        const { error } = await supabase.auth.signOut();
        if (!error) {
            setUser(null);
        }
        return { error };
    };

    // Since this is admin-only, everyone is a superuser
    const isSuperuser = !!user;
    const isAdmin = !!user; // Same as superuser in this context

    return {
        user,
        loading,
        signIn,
        signOut,

        // For admin app, everyone who can access is a superuser
        isSuperuser,
        isAdmin,

        // Admin-specific helper
        canAccessAdminApp: !!user,
    };
};