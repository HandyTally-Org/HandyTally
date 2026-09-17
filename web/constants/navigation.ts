import type { Ionicons } from '@expo/vector-icons';

// HT-48: the one list of what is in the sidebar. The drawer content and the
// <Drawer.Screen> registrations in app/(app)/_layout.tsx both map over it,
// so a screen can never be in one and not the other. The Settings page
// (HT-50) reorders and hides these entries per organisation; `key` is what
// it stores, so keys must not change once shipped.

export type NavIcon = keyof typeof Ionicons.glyphMap;

export type NavChild = {
  key: string;
  label: string;
  icon: NavIcon;
  /** Route pushed when the entry is pressed. */
  route: string;
  /** File route registered on the drawer (hidden from its default list). */
  screen: string;
};

export type NavItem = {
  key: string;
  label: string;
  icon: NavIcon;
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
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', route: '/', screen: 'index' },
  { key: 'clients', label: 'Clients', icon: 'people-outline', route: '/clients', screen: 'clients' },
  { key: 'jobs', label: 'Jobs', icon: 'briefcase-outline', route: '/jobs', screen: 'jobs' },
  { key: 'invoices', label: 'Invoices', icon: 'document-text-outline', route: '/invoices', screen: 'invoices' },
  { key: 'labor', label: 'Labor', icon: 'hammer-outline', route: '/labor', screen: 'labor' },
  { key: 'inventory', label: 'Inventory', icon: 'cube-outline', route: '/inventory', screen: 'inventory' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar-outline', route: '/schedule', screen: 'schedule' },
  {
    key: 'admin',
    label: 'Admin',
    icon: 'settings-outline',
    route: '/admin',
    screen: 'admin',
    adminOnly: true,
    pinned: true,
    children: [
      { key: 'admin-users', label: 'Users', icon: 'people', route: '/admin/users', screen: 'admin/users' },
      { key: 'admin-company', label: 'Company', icon: 'business', route: '/admin/company', screen: 'admin/company' },
    ],
  },
];
