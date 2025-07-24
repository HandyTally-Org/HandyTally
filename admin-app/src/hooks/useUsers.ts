import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { UserProfile, CreateUserData } from '../types';

export const useUsers = () => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select(`
          *,
          organization:organizations(*)
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const createUser = async (userData: CreateUserData) => {
        try {
            // Create user in auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        first_name: userData.first_name,
                        last_name: userData.last_name,
                    },
                },
            });

            if (authError) throw authError;

            if (authData.user) {
                // Update user profile with role and organization
                const { error: profileError } = await supabase
                    .from('user_profiles')
                    .update({
                        role: userData.role,
                        organization_id: userData.organization_id,
                    })
                    .eq('id', authData.user.id);

                if (profileError) throw profileError;

                // Create organization membership if organization_id provided
                if (userData.organization_id) {
                    const { error: membershipError } = await supabase
                        .from('organization_memberships')
                        .insert({
                            user_id: authData.user.id,
                            organization_id: userData.organization_id,
                            role: userData.role,
                        });

                    if (membershipError) throw membershipError;
                }
            }

            await fetchUsers();
            return { data: authData, error: null };
        } catch (error) {
            console.error('Error creating user:', error);
            return { data: null, error };
        }
    };

    const updateUser = async (userId: string, updates: Partial<UserProfile>) => {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', userId)
                .select();

            if (error) throw error;
            await fetchUsers();
            return { data, error: null };
        } catch (error) {
            console.error('Error updating user:', error);
            return { data: null, error };
        }
    };

    const deleteUser = async (userId: string) => {
        try {
            // Delete from auth (cascade will handle profile deletion)
            const { error } = await supabase.auth.admin.deleteUser(userId);
            if (error) throw error;

            await fetchUsers();
            return { error: null };
        } catch (error) {
            console.error('Error deleting user:', error);
            return { error };
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    return {
        users,
        loading,
        fetchUsers,
        createUser,
        updateUser,
        deleteUser,
    };
};