import type { OrganizationLabels } from './labels';
import type { NavItem } from './navigation';

// HT-50: the organisation's Settings row (organization_settings) as the app
// reads it, plus the pure rules for applying it. Each jsonb column is one
// document here; a missing column or a brand-new organisation gets the
// defaults, so screens never have to check for a row.

/** organization_settings.nav */
export type NavSettings = {
  /** Sidebar order, as nav keys. Keys it does not know append at the end. */
  order: string[];
  /** Nav keys removed from the sidebar. Their routes still resolve if typed. */
  hidden: string[];
};

export type OrganizationSettings = {
  nav: NavSettings;
  labels: OrganizationLabels;
  /** HT-52 / HT-53 define the shape; carried through untouched until then. */
  customFields: Record<string, unknown>;
};

export const DEFAULT_NAV_SETTINGS: NavSettings = { order: [], hidden: [] };

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  nav: DEFAULT_NAV_SETTINGS,
  labels: {},
  customFields: {},
};

/** A row as PostgREST returns it; every column may be missing or malformed. */
export type OrganizationSettingsRow = {
  organization_id: string;
  nav?: unknown;
  labels?: unknown;
  custom_fields?: unknown;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Turn a row into settings, tolerating anything the columns might hold. */
export function parseOrganizationSettings(row: OrganizationSettingsRow | null | undefined): OrganizationSettings {
  if (!row) return DEFAULT_ORGANIZATION_SETTINGS;
  const nav = record(row.nav);
  return {
    nav: { order: stringList(nav.order), hidden: stringList(nav.hidden) },
    labels: record(row.labels) as OrganizationLabels,
    customFields: record(row.custom_fields),
  };
}

/**
 * The sidebar in the organisation's order. Saved keys come first in the
 * saved order; keys the saved order does not know (a screen added in a later
 * release) append at the bottom in default order, so a deploy never hides
 * a new screen. Pinned items always sit last and are never hidden. Unknown
 * saved keys (a screen that was removed) are ignored.
 */
export function applyNavSettings(items: readonly NavItem[], settings: NavSettings | null | undefined): NavItem[] {
  const nav = settings ?? DEFAULT_NAV_SETTINGS;
  const byKey = new Map(items.map(item => [item.key, item]));
  const hidden = new Set(nav.hidden);

  const ordered: NavItem[] = [];
  const seen = new Set<string>();
  for (const key of nav.order) {
    const item = byKey.get(key);
    if (item && !seen.has(key) && !item.pinned) {
      ordered.push(item);
      seen.add(key);
    }
  }
  for (const item of items) {
    if (!seen.has(item.key) && !item.pinned) {
      ordered.push(item);
      seen.add(item.key);
    }
  }
  const visible = ordered.filter(item => !hidden.has(item.key));
  return [...visible, ...items.filter(item => item.pinned)];
}

/** The order the editor shows: every unpinned item, then the pinned ones, hidden included. */
export function editableNavOrder(items: readonly NavItem[], settings: NavSettings | null | undefined): NavItem[] {
  const nav = settings ?? DEFAULT_NAV_SETTINGS;
  return applyNavSettings(items, { order: nav.order, hidden: [] });
}

/** What to store for an editor state: the unpinned keys in order, and the hidden ones among them. */
export function toNavSettings(ordered: readonly NavItem[], hidden: ReadonlySet<string>): NavSettings {
  const unpinned = ordered.filter(item => !item.pinned);
  return {
    order: unpinned.map(item => item.key),
    hidden: unpinned.filter(item => hidden.has(item.key)).map(item => item.key),
  };
}
