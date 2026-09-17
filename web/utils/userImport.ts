import { ROLE_LABELS, type InvitableRole, type OrganizationMember } from './inviteUser';

// HT-46: the Excel sheet behind Admin > Users. Export writes one row per
// member; import reads the same columns back and turns them into a plan the
// page shows as a preview before anything is applied. Everything here is
// pure so the rules are unit-tested; the same guards are enforced again by
// apply_user_import() in the database.
//
// Columns (header row, any case):
//   email        the key; the only stable identifier a person can type
//   first_name   editable
//   last_name    editable
//   role         admin | user (or Member) | technician; editable
//   active       y / n; editable
//   delete       y removes the person from this organisation. Their account
//                is deleted only when they belong to no other organisation.
//
// An email that is not a member yet is invited with the role in the row
// (member when blank). Superusers are never exported and cannot be changed
// by a sheet.

export const USER_SHEET_NAME = 'Users';

export type UserSheetRow = {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  active: 'y' | 'n';
  delete: 'n';
};

export const USER_SHEET_COLUMN_WIDTHS = [32, 18, 18, 12, 8, 8];

export function membersToSheetRows(members: OrganizationMember[]): UserSheetRow[] {
  return members
    .filter(m => m.role !== 'superuser')
    .map(m => ({
      email: m.email,
      first_name: m.first_name ?? '',
      last_name: m.last_name ?? '',
      role: m.role,
      active: m.is_active ? 'y' : 'n',
      delete: 'n',
    }));
}

export type MemberUpdate = {
  user_id: string;
  email: string;
  role?: InvitableRole;
  is_active?: boolean;
  first_name?: string;
  last_name?: string;
};

export type InviteRow = {
  email: string;
  first_name: string;
  last_name: string;
  role: InvitableRole;
};

export type UserImportPlan = {
  updates: MemberUpdate[];
  removals: OrganizationMember[];
  invites: InviteRow[];
  unchanged: number;
  /** Row-level problems. When non-empty nothing may be applied. */
  errors: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown): string => (value == null ? '' : String(value).trim());

function yesNo(value: unknown): boolean | null | 'invalid' {
  const v = text(value).toLowerCase();
  if (v === '') return null;
  if (['y', 'yes', 'true', '1', 'active'].includes(v)) return true;
  if (['n', 'no', 'false', '0', 'inactive'].includes(v)) return false;
  return 'invalid';
}

function parseRole(value: unknown): InvitableRole | null | 'invalid' {
  const v = text(value).toLowerCase();
  if (v === '') return null;
  if (v === 'admin' || v === 'administrator') return 'admin';
  if (v === 'user' || v === 'member') return 'user';
  if (v === 'technician' || v === 'tech') return 'technician';
  return 'invalid';
}

/** Lower-cased, trimmed header lookup so "Email", " email " and "EMAIL" all work. */
function cell(row: Record<string, unknown>, column: string): unknown {
  const key = Object.keys(row).find(k => k.trim().toLowerCase() === column);
  return key === undefined ? undefined : row[key];
}

export function planUserImport(
  rows: Record<string, unknown>[],
  members: OrganizationMember[],
  currentUserId: string | null | undefined,
): UserImportPlan {
  const plan: UserImportPlan = { updates: [], removals: [], invites: [], unchanged: 0, errors: [] };
  const byEmail = new Map(members.map(m => [m.email.toLowerCase(), m]));
  const seen = new Set<string>();

  // Who is an active admin once the sheet is applied; the organisation must
  // keep at least one.
  const activeAdmins = new Set(
    members.filter(m => m.role === 'admin' && m.is_active).map(m => m.user_id),
  );

  rows.forEach((row, index) => {
    const line = index + 2; // header is row 1
    const email = text(cell(row, 'email')).toLowerCase();
    if (!email) return; // blank line
    if (!EMAIL_RE.test(email)) {
      plan.errors.push(`Row ${line}: "${email}" is not a valid email address`);
      return;
    }
    if (seen.has(email)) {
      plan.errors.push(`Row ${line}: ${email} appears more than once`);
      return;
    }
    seen.add(email);

    const role = parseRole(cell(row, 'role'));
    if (role === 'invalid') {
      plan.errors.push(`Row ${line}: role must be admin, member or technician`);
      return;
    }
    const active = yesNo(cell(row, 'active'));
    if (active === 'invalid') {
      plan.errors.push(`Row ${line}: active must be y or n`);
      return;
    }
    const remove = yesNo(cell(row, 'delete'));
    if (remove === 'invalid') {
      plan.errors.push(`Row ${line}: delete must be y or n`);
      return;
    }
    const firstName = cell(row, 'first_name');
    const lastName = cell(row, 'last_name');

    const member = byEmail.get(email);

    if (!member) {
      if (remove === true) {
        plan.errors.push(`Row ${line}: ${email} is not a member, so there is nothing to delete`);
        return;
      }
      plan.invites.push({
        email,
        first_name: text(firstName),
        last_name: text(lastName),
        role: role ?? 'user',
      });
      return;
    }

    if (member.role === 'superuser') {
      plan.errors.push(`Row ${line}: ${email} is a platform account and cannot be changed by an import`);
      return;
    }
    const isSelf = !!currentUserId && member.user_id === currentUserId;

    if (remove === true) {
      if (isSelf) {
        plan.errors.push(`Row ${line}: you cannot delete yourself`);
        return;
      }
      plan.removals.push(member);
      activeAdmins.delete(member.user_id);
      return;
    }

    const update: MemberUpdate = { user_id: member.user_id, email };
    if (role !== null && role !== member.role) {
      if (isSelf) {
        plan.errors.push(`Row ${line}: you cannot change your own role`);
        return;
      }
      update.role = role;
    }
    if (active !== null && active !== member.is_active) {
      if (isSelf && active === false) {
        plan.errors.push(`Row ${line}: you cannot deactivate yourself`);
        return;
      }
      update.is_active = active;
    }
    if (firstName !== undefined && text(firstName) !== (member.first_name ?? '')) {
      update.first_name = text(firstName);
    }
    if (lastName !== undefined && text(lastName) !== (member.last_name ?? '')) {
      update.last_name = text(lastName);
    }

    const finalRole = update.role ?? member.role;
    const finalActive = update.is_active ?? member.is_active;
    if (finalRole === 'admin' && finalActive) activeAdmins.add(member.user_id);
    else activeAdmins.delete(member.user_id);

    if (Object.keys(update).length > 2) plan.updates.push(update);
    else plan.unchanged += 1;
  });

  const touchesMembers = plan.updates.length > 0 || plan.removals.length > 0;
  if (touchesMembers && activeAdmins.size === 0) {
    plan.errors.push('The sheet would leave this organization without an active admin');
  }

  return plan;
}

/** One line per change, for the preview dialog. */
export function describeUpdate(update: MemberUpdate): string {
  const parts: string[] = [];
  if (update.role) parts.push(`role → ${ROLE_LABELS[update.role] ?? update.role}`);
  if (update.is_active !== undefined) parts.push(update.is_active ? 'reactivate' : 'deactivate');
  if (update.first_name !== undefined || update.last_name !== undefined) parts.push('name');
  return `${update.email}: ${parts.join(', ')}`;
}
