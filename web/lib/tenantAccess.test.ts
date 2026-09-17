import { pickMembership, resolveTenantMembership, type MembershipRow } from './tenantAccess';

const wg = { org_id: 'org-wg', org_name: 'WG Electric' };
const demo = { org_id: 'org-demo', org_name: 'Demo' };

const row = (org: typeof wg, user_role: MembershipRow['user_role'], is_active = true): MembershipRow => ({
  ...org,
  user_role,
  is_active,
});

describe('resolveTenantMembership (HT-38 gate, HT-65 regression)', () => {
  it('refuses a user whose only membership is in another organisation', () => {
    expect(resolveTenantMembership([row(wg, 'admin')], demo.org_id)).toBeNull();
  });

  it('refuses an inactive membership of the tenant organisation', () => {
    expect(resolveTenantMembership([row(demo, 'user', false)], demo.org_id)).toBeNull();
  });

  it('refuses a user with no rows at all', () => {
    expect(resolveTenantMembership([], demo.org_id)).toBeNull();
  });

  it('admits an active member of the tenant organisation with their role there', () => {
    const rows = [row(wg, 'admin'), row(demo, 'technician')];
    expect(resolveTenantMembership(rows, demo.org_id)).toEqual({
      organization: { id: demo.org_id, name: demo.org_name },
      role: 'technician',
    });
  });

  it('admits a superuser on every organisation through the synthetic row', () => {
    const rows = [row(wg, 'admin'), row(demo, 'superuser')];
    expect(resolveTenantMembership(rows, demo.org_id)?.role).toBe('superuser');
    expect(resolveTenantMembership(rows, wg.org_id)?.role).toBe('admin');
  });
});

describe('pickMembership (no hostname tenant)', () => {
  it('prefers a real admin membership over a synthetic superuser row', () => {
    const rows = [row(demo, 'superuser'), row(wg, 'admin')];
    expect(pickMembership(rows)?.organization.id).toBe(wg.org_id);
  });

  it('prefers admin over member', () => {
    const rows = [row(demo, 'user'), row(wg, 'admin')];
    expect(pickMembership(rows)?.organization.id).toBe(wg.org_id);
  });

  it('ignores inactive rows and returns null when none remain', () => {
    expect(pickMembership([row(wg, 'admin', false)])).toBeNull();
  });

  it('does not reorder the caller\'s array', () => {
    const rows = [row(demo, 'user'), row(wg, 'admin')];
    pickMembership(rows);
    expect(rows[0].org_id).toBe(demo.org_id);
  });
});
