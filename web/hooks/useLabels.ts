import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { mergeLabels, type LabelDef, type LabelSection } from '../constants/labels';

// HT-49: the list a screen renders a section's statuses or tags from —
// built-ins plus whatever the organisation has renamed, recoloured or added
// in Settings (HT-51). Until organization_settings ships (HT-50)
// `organizationLabels` is null and the list is just the built-ins.
export function useLabels(section: LabelSection): LabelDef[] {
  const { organizationLabels } = useAuth();
  return useMemo(() => mergeLabels(section, organizationLabels), [section, organizationLabels]);
}
