// src/hooks/useOrganizations.ts - Enhanced with error handling
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Organization, CreateOrganizationData } from '../types';

interface CreateOrgResult {
    success: boolean;
    organization?: Organization;
    infrastructure?: {
        success: boolean;
        route53: string;
        vercel: string;
        domain?: string;
        errors: string[];
    };
    error?: any;
}

export const useOrganizations = () => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    const fetchOrganizations = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('organizations')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setOrganizations(data || []);
        } catch (error) {
            console.error('Error fetching organizations:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const createOrganization = async (orgData: CreateOrganizationData): Promise<CreateOrgResult> => {
        setCreating(true);
        try {
            console.log('Creating organization with infrastructure:', orgData);

            // Validate input client-side
            if (!orgData.name?.trim() || !orgData.subdomain?.trim()) {
                throw new Error('Name and subdomain are required');
            }

            // Format subdomain
            const formattedSubdomain = orgData.subdomain.toLowerCase().trim();

            // Call the Edge Function
            const { data, error } = await supabase.functions.invoke('create-organization', {
                body: {
                    name: orgData.name.trim(),
                    subdomain: formattedSubdomain
                },
            });

            if (error) {
                console.error('Edge function error:', error);
                throw new Error(error.message || 'Failed to create organization');
            }

            if (!data?.success) {
                throw new Error(data?.error || 'Organization creation failed');
            }

            console.log('Organization creation result:', data);

            // Refresh the organizations list
            await fetchOrganizations();

            return {
                success: true,
                organization: data.organization,
                infrastructure: data.infrastructure
            };
        } catch (error) {
            console.error('Error creating organization:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        } finally {
            setCreating(false);
        }
    };

    const updateOrganization = async (orgId: string, updates: Partial<Organization>) => {
        try {
            const { data, error } = await supabase
                .from('organizations')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', orgId)
                .select();

            if (error) throw error;
            await fetchOrganizations();
            return { data, error: null };
        } catch (error) {
            console.error('Error updating organization:', error);
            return { data: null, error };
        }
    };

    const deleteOrganization = async (orgId: string) => {
        try {
            // Note: In production, you might want to create a separate Edge Function
            // to handle cleanup of DNS records and Vercel projects before deletion
            const { error } = await supabase
                .from('organizations')
                .delete()
                .eq('id', orgId);

            if (error) throw error;
            await fetchOrganizations();
            return { error: null };
        } catch (error) {
            console.error('Error deleting organization:', error);
            return { error };
        }
    };

    // Get organization by subdomain
    const getOrganizationBySubdomain = (subdomain: string) => {
        return organizations.find(org => org.subdomain === subdomain);
    };

    // Get organizations by status
    const getOrganizationsByStatus = (status: 'active' | 'inactive' | 'pending') => {
        return organizations.filter(org => org.status === status);
    };

    useEffect(() => {
        fetchOrganizations();
    }, []);

    return {
        organizations,
        loading,
        creating,
        fetchOrganizations,
        createOrganization,
        updateOrganization,
        deleteOrganization,
        getOrganizationBySubdomain,
        getOrganizationsByStatus,

        // Computed stats
        totalOrganizations: organizations.length,
        activeOrganizations: organizations.filter(org => org.status === 'active').length,
        pendingOrganizations: organizations.filter(org => org.status === 'pending').length,
    };
};