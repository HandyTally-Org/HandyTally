import { membersToSheetRows, planUserImport } from './userImport';
import type { OrganizationMember } from './inviteUser';

const member = (
  overrides: Partial<OrganizationMember> & Pick<OrganizationMember, 'user_id' | 'email'>,
): OrganizationMember => ({
  first_name: null,
  last_name: null,
  role: 'user',
  is_active: true,
  joined_at: '2026-09-01T00:00:00Z',
  last_sign_in_at: null,
  ...overrides,
});

const me = member({ user_id: 'u-me', email: 'me@example.com', role: 'admin', first_name: 'Me' });
const bob = member({ user_id: 'u-bob', email: 'bob@example.com', role: 'technician', first_name: 'Bob' });
const ann = member({ user_id: 'u-ann', email: 'ann@example.com', role: 'admin', first_name: 'Ann' });
const root = member({ user_id: 'u-root', email: 'admin@handytally.com', role: 'superuser' });
const members = [me, bob, ann, root];

describe('membersToSheetRows', () => {
  it('writes one row per member, never a superuser, with delete = n', () => {
    const rows = membersToSheetRows(members);
    expect(rows.map(r => r.email)).toEqual(['me@example.com', 'bob@example.com', 'ann@example.com']);
    expect(rows[1]).toEqual({ email: 'bob@example.com', first_name: 'Bob', last_name: '', role: 'technician', active: 'y', delete: 'n' });
  });
});

describe('planUserImport', () => {
  it('counts an unchanged exported row as unchanged', () => {
    const plan = planUserImport(membersToSheetRows(members), members, me.user_id);
    expect(plan.errors).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(3);
  });

  it('reads headers in any case and accepts role labels', () => {
    const plan = planUserImport([{ Email: 'BOB@example.com', Role: 'Member', Active: 'n' }], members, me.user_id);
    expect(plan.errors).toEqual([]);
    expect(plan.updates).toEqual([{ user_id: 'u-bob', email: 'bob@example.com', role: 'user', is_active: false }]);
  });

  it('turns delete = y into a removal', () => {
    const plan = planUserImport([{ email: 'bob@example.com', delete: 'y' }], members, me.user_id);
    expect(plan.removals.map(m => m.user_id)).toEqual(['u-bob']);
  });

  it('invites an unknown address with the row role, member by default', () => {
    const plan = planUserImport(
      [{ email: 'new@example.com', first_name: 'New' }, { email: 'boss@example.com', role: 'admin' }],
      members,
      me.user_id,
    );
    expect(plan.invites).toEqual([
      { email: 'new@example.com', first_name: 'New', last_name: '', role: 'user' },
      { email: 'boss@example.com', first_name: '', last_name: '', role: 'admin' },
    ]);
  });

  it('refuses to delete, demote or deactivate the caller', () => {
    expect(planUserImport([{ email: 'me@example.com', delete: 'y' }], members, me.user_id).errors[0]).toMatch(/delete yourself/);
    expect(planUserImport([{ email: 'me@example.com', role: 'user' }], members, me.user_id).errors[0]).toMatch(/own role/);
    expect(planUserImport([{ email: 'me@example.com', active: 'n' }], members, me.user_id).errors[0]).toMatch(/deactivate yourself/);
  });

  it('refuses to touch a superuser', () => {
    const plan = planUserImport([{ email: 'admin@handytally.com', role: 'user' }], members, me.user_id);
    expect(plan.errors[0]).toMatch(/platform account/);
  });

  it('refuses a sheet that leaves no active admin', () => {
    const plan = planUserImport(
      [{ email: 'me@example.com', delete: 'n' }, { email: 'ann@example.com', delete: 'y' }],
      [bob, ann, root],
      bob.user_id,
    );
    expect(plan.errors).toContain('The sheet would leave this organization without an active admin');
  });

  it('rejects bad emails, duplicate rows, and unknown role or flag values', () => {
    const plan = planUserImport(
      [
        { email: 'not-an-email' },
        { email: 'bob@example.com', role: 'ceo' },
        { email: 'ann@example.com', active: 'maybe' },
        { email: 'ann@example.com' },
      ],
      members,
      me.user_id,
    );
    expect(plan.errors).toHaveLength(4);
    expect(plan.errors[3]).toMatch(/more than once/);
  });

  it('rejects deleting someone who is not a member', () => {
    const plan = planUserImport([{ email: 'ghost@example.com', delete: 'y' }], members, me.user_id);
    expect(plan.errors[0]).toMatch(/nothing to delete/);
  });

  it('skips blank lines', () => {
    const plan = planUserImport([{ email: '' }, {}], members, me.user_id);
    expect(plan.errors).toEqual([]);
    expect(plan.unchanged).toBe(0);
  });
});
