import { supabase } from '../lib/supabase';

// HT-12: organisation member management from the Admin > Users screen.
//
// Inviting goes through the invite-user edge function, because creating the
// auth account and emailing the one-time set-password link both need the
// service role. Listing, role changes and deactivation are database functions
// that check the caller's role themselves (see the
// organization_member_management migration).

export type InvitableRole = 'admin' | 'user' | 'technician';

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  user: 'Member',
  technician: 'Technician',
  superuser: 'Superuser',
};

export type OrganizationMember = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: InvitableRole | 'superuser';
  is_active: boolean;
  joined_at: string;
  last_sign_in_at: string | null;
};

export type InviteUserInput = {
  organizationId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: InvitableRole;
};

export type InviteUserResult = {
  userId: string;
  email: string;
  role: InvitableRole;
  /** True when the address already had an account and was only added to the organisation. */
  existingAccount: boolean;
};

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: input,
  });

  if (error) {
    // On a non-2xx supabase-js only says "Edge Function returned a non-2xx
    // status code"; the function's { error } body is on error.context.
    let reason = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) reason = body.error;
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new Error(reason);
  }

  return data as InviteUserResult;
}

export async function listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const { data, error } = await supabase.rpc('list_organization_members', { org_id: organizationId });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrganizationMember[];
}

export async function setMemberRole(organizationId: string, userId: string, role: InvitableRole): Promise<void> {
  const { error } = await supabase.rpc('set_organization_member_role', {
    org_id: organizationId,
    target_user_id: userId,
    new_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function setMemberActive(organizationId: string, userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_organization_member_active', {
    org_id: organizationId,
    target_user_id: userId,
    active,
  });
  if (error) throw new Error(error.message);
}
