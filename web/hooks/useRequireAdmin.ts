import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

// HT-12: admin-only screens call this at the top and render nothing until it
// returns true. A signed-in user who is not an admin of their organisation is
// sent back to the dashboard. The Admin entry is also hidden from the drawer,
// so this only matters for a typed URL.
//
// This is route gating, not a security boundary: the database functions the
// admin screens call check the caller's role themselves.
export function useRequireAdmin(): boolean {
  const { session, isLoading, isAdmin, membershipLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !session || !membershipLoaded) return;
    if (!isAdmin) router.replace('/');
  }, [isLoading, session, membershipLoaded, isAdmin, router]);

  return !!session && membershipLoaded && isAdmin;
}
