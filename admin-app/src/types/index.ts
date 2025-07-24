export type UserRole = 'user' | 'admin' | 'superuser';
export type OrganizationStatus = 'active' | 'inactive' | 'pending';

export interface Organization {
    id: string;
    name: string;
    subdomain: string;
    domain?: string;
    status: OrganizationStatus;
    route53_hosted_zone_id?: string;
    vercel_project_id?: string;
    created_at: string;
    updated_at: string;
}

export interface UserProfile {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role: UserRole;
    organization_id?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    organization?: Organization;
}

export interface OrganizationMembership {
    id: string;
    user_id: string;
    organization_id: string;
    role: UserRole;
    created_at: string;
    user_profile?: UserProfile;
    organization?: Organization;
}

export interface CreateUserData {
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    role: UserRole;
    organization_id?: string;
}

export interface CreateOrganizationData {
    name: string;
    subdomain: string;
}