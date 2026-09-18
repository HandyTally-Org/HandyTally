import { createContext, useState, useEffect, useContext, useCallback, ReactNode } from 'react';
import type { OrganizationLabels } from '../constants/labels';
import {
  DEFAULT_ORGANIZATION_SETTINGS,
  parseOrganizationSettings,
  type OrganizationSettings,
  type OrganizationSettingsRow,
} from '../constants/organizationSettings';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { tenantSubdomain } from '../lib/tenant';

// HT-12: the app is organisation-aware. Alongside the session, the context
// exposes which organisation the user works in and what they are inside it.
//
//   'admin'       manages users and company settings
//   'user'        a member: everything except Admin
//   'technician'  treated like a member for now (HT-9 will narrow it)
//   'superuser'   platform operator; get_user_organizations() reports every
//                 organisation with this role, and the app treats it as admin
//
// HT-38: the hostname picks the organisation. On a customer subdomain
// (wgelectric.handytally.com) the tenant is resolved from `organizations`
// before anyone signs in, and a signed-in user must hold an active membership
// of that organisation (superusers always pass); otherwise they are signed out
// with a message. On the apex, www, localhost and the workers.dev URL there is
// no hostname tenant and the user's best membership is used, as before.
//
// A signed-in user with no membership row gets organization = null and
// role = null. Everything except Admin still works for them today, because
// the row-level-security policies are not organisation-scoped yet (HT-14
// phase 2).
import {
  pickMembership,
  resolveTenantMembership,
  type Membership,
  type MembershipRow,
  type Organization,
  type OrgRole,
} from '../lib/tenantAccess';

export type { Organization, OrgRole };

export type TenantState =
  /** No tenant in the hostname: apex, www, localhost, workers.dev, native. */
  | { status: 'none' }
  | { status: 'loading'; subdomain: string }
  | { status: 'found'; subdomain: string; organization: Organization }
  /** The subdomain matches no active organisation. */
  | { status: 'not_found'; subdomain: string };

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
  organization: Organization | null;
  role: OrgRole | null;
  /** True for organisation admins and superusers. */
  isAdmin: boolean;
  /** False until the membership for the current session has been looked up. */
  membershipLoaded: boolean;
  /** What the hostname says about the tenant (HT-38). */
  tenant: TenantState;
  /** Where `organization` came from: the hostname, or the user's best membership. */
  tenantSource: 'hostname' | 'membership' | null;
  /** Set when the last sign-in was refused because the user is not a member of the hostname tenant. */
  accessDenied: string | null;
  /**
   * The organisation's renamed, recoloured and added status/tag values
   * (HT-49). Null until HT-50 loads organization_settings.labels; readers go
   * through hooks/useLabels.ts, which merges it with the built-ins.
   */
  organizationLabels: OrganizationLabels | null;
  /**
   * The organisation's Settings row (HT-50): sidebar order, label overrides,
   * custom field definitions and, since HT-68, the colour theme. Defaults
   * until the row is read, and for an organisation that has never saved one.
   */
  settings: OrganizationSettings;
  /** False until the settings row for the current organisation has been read. */
  settingsLoaded: boolean;
  /** Re-read the settings row, after the Settings page saves. */
  refreshSettings: () => Promise<void>;
  refreshMembership: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// get_user_organizations(target_user_id) returns one row per membership and,
// for a superuser, a synthetic 'superuser' row for every organisation they
// are not a member of. How the rows turn into "the organisation the user is
// acting in" lives in lib/tenantAccess.ts (pickMembership,
// resolveTenantMembership) so the HT-38 gate is unit-tested (HT-65).
//
// target_user_id is passed explicitly: the database also had an older
// zero-argument get_user_organizations() returning uuid[], and a call with no
// arguments was ambiguous between the two.
async function fetchMembershipRows(userId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase.rpc('get_user_organizations', { target_user_id: userId });
  if (error) {
    console.error('Error loading organization membership:', error);
    return [];
  }
  return (data ?? []) as MembershipRow[];
}

// SECURITY DEFINER lookup callable by the anon role, so the login screen can
// name the organisation before there is a session. Only active rows resolve.
async function fetchTenantOrganization(subdomain: string): Promise<Organization | null> {
  const { data, error } = await supabase.rpc('get_organization_by_subdomain', { p_subdomain: subdomain });
  if (error) {
    console.error('Error resolving tenant from hostname:', error);
    return null;
  }
  const row = ((data ?? []) as { id: string; name: string }[])[0];
  return row ? { id: row.id, name: row.name } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [membership, setMembership] = useState<Membership>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  // Starts as 'none' on both the static render (no window) and the first client
  // render, so hydration matches; the effect below switches to 'loading' and
  // resolves it right after mount.
  const [tenant, setTenant] = useState<TenantState>({ status: 'none' });
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrganizationSettings>(DEFAULT_ORGANIZATION_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setIsLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  // Resolve the hostname tenant once. The hostname cannot change without a
  // full navigation, so this never needs to re-run.
  useEffect(() => {
    if (!tenantSubdomain) return;
    let cancelled = false;
    setTenant({ status: 'loading', subdomain: tenantSubdomain });
    fetchTenantOrganization(tenantSubdomain).then(organization => {
      if (cancelled) return;
      setTenant(
        organization
          ? { status: 'found', subdomain: tenantSubdomain, organization }
          : { status: 'not_found', subdomain: tenantSubdomain },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyed on the user id, not the session object: a token refresh produces a
  // new session for the same user and must not blank the admin screens.
  const userId = session?.user?.id ?? null;

  const refreshMembership = useCallback(async () => {
    if (!userId) {
      setMembership(null);
      setMembershipLoaded(true);
      return;
    }
    // The effect below re-runs when the tenant resolves.
    if (tenant.status === 'loading') return;
    if (tenantSubdomain && tenant.status === 'none') return; // not switched to loading yet

    const rows = await fetchMembershipRows(userId);

    if (tenant.status === 'found') {
      const here = resolveTenantMembership(rows, tenant.organization.id);
      if (!here) {
        // Signed in, but not a member of the organisation at this address.
        // Sign out; the login screen shows the reason.
        setAccessDenied(`You are not a member of ${tenant.organization.name}.`);
        setMembership(null);
        setMembershipLoaded(true);
        await supabase.auth.signOut();
        return;
      }
      setMembership(here);
    } else if (tenant.status === 'not_found') {
      setMembership(null);
    } else {
      setMembership(pickMembership(rows));
    }
    setMembershipLoaded(true);
  }, [userId, tenant]);

  // Re-read the membership whenever the signed-in user or the tenant changes.
  useEffect(() => {
    if (isLoading) return;
    setMembershipLoaded(false);
    refreshMembership();
  }, [isLoading, refreshMembership]);

  // HT-50: the Settings row rides on the organisation. organization_id is
  // sent explicitly (and not inferred from the header) because requests from
  // the apex, native and psql carry no tenant; RLS still scopes the read.
  const organizationId = membership?.organization.id ?? null;
  const refreshSettings = useCallback(async () => {
    if (!organizationId) {
      setSettings(DEFAULT_ORGANIZATION_SETTINGS);
      setSettingsLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from('organization_settings')
      .select('organization_id, nav, labels, custom_fields, theme')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) {
      console.error('Error loading organization settings:', error);
    }
    setSettings(parseOrganizationSettings((data as OrganizationSettingsRow | null) ?? null));
    setSettingsLoaded(true);
  }, [organizationId]);

  useEffect(() => {
    setSettingsLoaded(false);
    refreshSettings();
  }, [refreshSettings]);

  // The session is set from the response, not only from onAuthStateChange:
  // the login screen navigates to the (app) group as soon as signIn resolves,
  // and that group's layout bounces any visitor without a session back to
  // /login. Waiting for the async auth event loses that race, which showed up
  // as "signing in just refreshes the login page" (the second half of HT-29).
  const signIn = async (email: string, password: string) => {
    setAccessDenied(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session) setSession(data.session);
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) setSession(data.session);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const role = membership?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        organization: membership?.organization ?? null,
        role,
        isAdmin: role === 'admin' || role === 'superuser',
        membershipLoaded,
        tenant,
        tenantSource: tenant.status === 'found' ? 'hostname' : membership ? 'membership' : null,
        accessDenied,
        organizationLabels: settings.labels,
        settings,
        settingsLoaded,
        refreshSettings,
        refreshMembership,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
