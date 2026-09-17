import { useAuth } from '../contexts/AuthContext';
import type { CustomFieldDef, CustomFieldSection } from '../constants/customFields';

const NONE: CustomFieldDef[] = [];

// HT-52: the custom fields an organisation defined for a section, in display
// order. Empty for an organisation that never opened Settings, so every
// form and detail page renders exactly as before.
export function useCustomFields(section: CustomFieldSection): CustomFieldDef[] {
  const { settings } = useAuth();
  return settings.customFields[section] ?? NONE;
}
