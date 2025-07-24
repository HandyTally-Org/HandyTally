import { supabase } from './supabase';
import { CreateOrganizationData } from '../types';

export const createOrganizationWithInfrastructure = async (orgData: CreateOrganizationData) => {
    try {
        const { data, error } = await supabase.functions.invoke('create-organization', {
            body: orgData,
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error creating organization:', error);
        return { data: null, error };
    }
};