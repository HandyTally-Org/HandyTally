import { createContext, useState, useEffect, useContext, useCallback, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// HT-12: the app is organisation-aware. Alongside the session, the context
// exposes which organisation the user works in and what they are inside it.
//
//   'admin'       manages users and company settings
//   'user'        a member: everything except Admin
//   'technician'  treated like a member for now (HT-9 will narrow it)
//   'superuser'   platform operator; get_user_organizations() reports every
//                 organisation with this role, and the app treats it as admin
//
// A signed-in user with no membership row gets organization = null and
// role = null. Everything except Admin still works for them today, because
// the row-level-security policies are not organisation-scoped yet (HT-14
// phase 2).
export type OrgRole = 'admin' | 'user' | 'technician' | 'superuser';

export type Organization = {
  id: string;
  name: string;
};

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
  organization: Organization | null;
  role: OrgRole | null;
  /** True for organisation admins and superusers. */
  isAdmin: boolean;
  /** False until the membership for the current session has been looked up. */
  membershipLoaded: boolean;
  refreshMembership: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type Membership = { organization: Organization; role: OrgRole } | null;

// get_user_organizations() returns one row per membership (and, for a
// superuser, one per organisation). Prefer the one where the user is admin,
// matching the ordering auto_set_organization_id() uses when stamping rows.
async function fetchMembership(): Promise<Membership> {
  const { data, error } = await supabase.rpc('get_user_organizations');
  if (error) {
    console.error('Error loading organization membership:', error);
    return null;
  }
  const rows = (data ?? []) as { org_id: string; org_name: string; user_role: OrgRole; is_active: boolean }[];
  const active = rows.filter(r => r.is_active);
  const rank = (r: OrgRole) => (r === 'superuser' ? 0 : r === 'admin' ? 1 : 2);
  const best = active.sort((a, b) => rank(a.user_role) - rank(b.user_role))[0];
  if (!best) return null;
  return { organization: { id: best.org_id, name: best.org_name }, role: best.user_role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [membership, setMembership] = useState<Membership>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(false);

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

  const refreshMembership = useCallback(async () => {
    if (!session) {
      setMembership(null);
      setMembershipLoaded(true);
      return;
    }
    setMembership(await fetchMembership());
    setMembershipLoaded(true);
  }, [session]);

  // Re-read the membership whenever the signed-in user changes.
  useEffect(() => {
    if (isLoading) return;
    setMembershipLoaded(false);
    refreshMembership();
  }, [isLoading, session?.user?.id, refreshMembership]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
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
