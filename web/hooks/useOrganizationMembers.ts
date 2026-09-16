import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listOrganizationMembers, type OrganizationMember } from '../utils/inviteUser';

// HT-35: the members of the signed-in user's organisation, for the Assigned
// to dropdown and for turning jobs.assigned_to into a name on the Jobs
// screens. Names cannot be joined from jobs: row-level security on
// user_profiles only exposes the caller's own row, so the list comes from the
// list_organization_members function (HT-12), which any active member may
// call. A user with no organisation gets an empty list.
export function useOrganizationMembers(): { members: OrganizationMember[]; loading: boolean } {
  const { organization } = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!organization) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listOrganizationMembers(organization.id)
      .then(list => { if (!cancelled) setMembers(list); })
      .catch(error => {
        console.error('Error loading organization members:', error);
        if (!cancelled) setMembers([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organization]);

  return { members, loading };
}
