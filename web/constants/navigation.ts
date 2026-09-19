import type { Ionicons } from '@expo/vector-icons';
import type { ThemeTokens } from './Colors';

// HT-48: the one list of what is in the sidebar. The drawer content and the
// <Drawer.Screen> registrations in app/(app)/_layout.tsx both map over it,
// so a screen can never be in one and not the other. The Settings page
// (HT-50) reorders and hides these entries per organisation; `key` is what
// it stores, so keys must not change once shipped.

export type NavIcon = keyof typeof Ionicons.glyphMap;

/** The colour token of an entry's icon (HT-68): one of the `nav*` keys of constants/Colors.ts. */
export type NavColor = Extract<keyof ThemeTokens, `nav${string}`>;

export type NavChild = {
  key: string;
  label: string;
  icon: NavIcon;
  /** Icon colour; a child shares its parent's hue so the group reads as one. */
  color: NavColor;
  /** Route pushed when the entry is pressed. */
  route: string;
  /** File route registered on the drawer (hidden from its default list). */
  screen: string;
};

export type NavItem = {
  key: string;
  label: string;
  icon: NavIcon;
  /** Icon colour, the module's hue in both themes. Only the stroke is coloured; the row stays neutral. */
  color: NavColor;
  route: string;
  screen: string;
  /** Rendered only for organisation admins and superusers (HT-12). */
  adminOnly?: boolean;
  /** Always last and never hidden by the Settings nav editor. */
  pinned?: boolean;
  /** Sub-entries shown in an expandable submenu; the parent itself does not navigate. */
  children?: NavChild[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', color: 'navDashboard', route: '/', screen: 'index' },
  { key: 'clients', label: 'Clients', icon: 'people-outline', color: 'navClients', route: '/clients', screen: 'clients' },
  { key: 'jobs', label: 'Jobs', icon: 'briefcase-outline', color: 'navJobs', route: '/jobs', screen: 'jobs' },
  { key: 'invoices', label: 'Invoices', icon: 'document-text-outline', color: 'navInvoices', route: '/invoices', screen: 'invoices' },
  { key: 'labor', label: 'Labor', icon: 'hammer-outline', color: 'navLabor', route: '/labor', screen: 'labor' },
  { key: 'inventory', label: 'Inventory', icon: 'cube-outline', color: 'navInventory', route: '/inventory', screen: 'inventory' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar-outline', color: 'navSchedule', route: '/schedule', screen: 'schedule' },
  {
    key: 'admin',
    label: 'Admin',
    icon: 'settings-outline',
    color: 'navAdmin',
    route: '/admin',
    screen: 'admin',
    adminOnly: true,
    pinned: true,
    children: [
      { key: 'admin-users', label: 'Users', icon: 'people', color: 'navAdmin', route: '/admin/users', screen: 'admin/users' },
      { key: 'admin-company', label: 'Company', icon: 'business', color: 'navAdmin', route: '/admin/company', screen: 'admin/company' },
      // HT-25: QuickBooks Online (and later other) exports.
      { key: 'admin-export', label: 'Export', icon: 'download-outline', color: 'navAdmin', route: '/admin/export', screen: 'admin/export' },
      // HT-50: the same gear as Admin itself, by decision.
      { key: 'admin-settings', label: 'Settings', icon: 'settings-outline', color: 'navAdmin', route: '/admin/settings', screen: 'admin/settings' },
    ],
  },
];
