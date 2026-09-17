// HT-38 / HT-65: which organisation a signed-in user is acting in, decided
// from the rows get_user_organizations() returns and the tenant named by the
// hostname. Pure so the rule can be tested without a session.
//
// get_user_organizations(target_user_id) returns one row per membership and,
// for a superuser, a synthetic 'superuser' row for every organisation they
// are not a member of.

export type OrgRole = 'admin' | 'user' | 'technician' | 'superuser';

export type Organization = {
  id: string;
  name: string;
};

export type MembershipRow = { org_id: string; org_name: string; user_role: OrgRole; is_active: boolean };

export type Membership = { organization: Organization; role: OrgRole } | null;

// A real membership wins over a synthetic superuser row, and admin over
// member, matching auto_set_organization_id(); a superuser with no
// membership at all falls back to the first organisation.
export function pickMembership(rows: MembershipRow[]): Membership {
  const active = rows.filter(r => r.is_active);
  const rank = (r: OrgRole) => (r === 'admin' ? 0 : r === 'superuser' ? 2 : 1);
  const best = [...active].sort((a, b) => rank(a.user_role) - rank(b.user_role))[0];
  if (!best) return null;
  return { organization: { id: best.org_id, name: best.org_name }, role: best.user_role };
}

// On <org>.handytally.com the user may act only as a member of that
// organisation: an active membership there, or the superuser row. Anything
// else (a membership elsewhere, an inactive one here, no rows) is null and the
// caller signs the user out with the not-a-member message.
export function resolveTenantMembership(rows: MembershipRow[], tenantOrgId: string): Membership {
  return pickMembership(rows.filter(r => r.org_id === tenantOrgId));
}
