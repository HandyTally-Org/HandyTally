import { supabase } from '../lib/supabase';

// HT-12: organisation member management from the Admin > Users screen.
//
// Inviting goes through the invite-user edge function, because creating the
// auth account and emailing the one-time set-password link both need the
// service role. Listing, role changes, deactivation and removal are database
// functions that check the caller's role themselves (see the
// organization_member_management and users_superusers_remove_delete
// migrations). Deleting an account (HT-65) is the delete-user edge function,
// again because the Auth admin API needs the service role.

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
  /**
   * 'superuser' rows are the platform accounts (HT-65): they hold no
   * membership row, appear on every organisation's list and take no actions.
   */
  role: InvitableRole | 'superuser';
  is_active: boolean;
  joined_at: string;
  last_sign_in_at: string | null;
};

// "First Last", or the email when no name is on file. One rule for the Users
// page and for everywhere a job's assignee is shown (HT-35).
export function memberDisplayName(
  m: Pick<OrganizationMember, 'first_name' | 'last_name' | 'email'>,
): string {
  return [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email;
}

// HT-35: what to show for jobs.assigned_to. The members list comes from
// list_organization_members, so a user who left the organisation (or belongs
// to another one) resolves to "Unknown user" rather than a blank.
export function assigneeLabel(
  userId: string | null | undefined,
  members: OrganizationMember[],
): string {
  if (!userId) return 'Unassigned';
  const member = members.find(m => m.user_id === userId);
  if (!member) return 'Unknown user';
  return member.is_active ? memberDisplayName(member) : `${memberDisplayName(member)} (inactive)`;
}

// Calls an edge function and surfaces its { error } body as the thrown
// message. On a non-2xx supabase-js only says "Edge Function returned a
// non-2xx status code"; the function's body is on error.context.
async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let reason = error.message;
    try {
      const parsed = await error.context?.json();
      if (parsed?.error) reason = parsed.error;
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new Error(reason);
  }
  return data as T;
}

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
  return invokeFunction<InviteUserResult>('invite-user', input);
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

// HT-65: drop the membership row. The account stays, and so does any other
// organisation the person belongs to. The database refuses self-removal,
// superusers and the organisation's last active admin.
export async function removeOrganizationMember(organizationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_organization_member', {
    org_id: organizationId,
    target_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

export type DeleteUserResult = {
  deleted: true;
  userId: string;
  email: string;
};

// HT-65: delete the auth account outright; profile and memberships cascade,
// records the person created keep a blank author. The function refuses the
// caller's own account, superusers, and (for an organisation admin) anyone
// who also belongs to an organisation the caller does not administer.
export async function deleteUserAccount(input: { userId: string; organizationId: string }): Promise<DeleteUserResult> {
  return invokeFunction<DeleteUserResult>('delete-user', input);
}

export type UserImportUpdate = {
  user_id: string;
  role?: InvitableRole;
  is_active?: boolean;
  first_name?: string;
  last_name?: string;
};

export type UserImportRemoval = {
  user_id: string;
  /** Memberships the person still holds elsewhere; 0 means the account can go. */
  memberships_left: number;
};

// HT-46: apply the membership half of an Excel import in one transaction;
// the database refuses the whole call when any row breaks a guard.
export async function applyUserImport(
  organizationId: string,
  updates: UserImportUpdate[],
  removals: string[],
): Promise<UserImportRemoval[]> {
  const { data, error } = await supabase.rpc('apply_user_import', {
    org_id: organizationId,
    updates,
    removals,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as UserImportRemoval[];
}
