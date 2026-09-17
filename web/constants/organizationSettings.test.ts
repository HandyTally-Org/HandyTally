import type { NavItem } from './navigation';
import { applyNavSettings, editableNavOrder, parseOrganizationSettings, toNavSettings } from './organizationSettings';

const item = (key: string, pinned = false): NavItem => ({
  key,
  label: key,
  icon: 'grid-outline',
  route: `/${key}`,
  screen: key,
  pinned: pinned || undefined,
});

const ITEMS: NavItem[] = [item('dashboard'), item('clients'), item('jobs'), item('invoices'), item('admin', true)];
const keys = (items: NavItem[]) => items.map(i => i.key);

describe('applyNavSettings', () => {
  it('returns the default order with no settings', () => {
    expect(keys(applyNavSettings(ITEMS, null))).toEqual(['dashboard', 'clients', 'jobs', 'invoices', 'admin']);
  });

  it('applies the saved order and hides hidden entries', () => {
    const out = applyNavSettings(ITEMS, { order: ['jobs', 'clients', 'dashboard', 'invoices'], hidden: ['invoices'] });
    expect(keys(out)).toEqual(['jobs', 'clients', 'dashboard', 'admin']);
  });

  it('appends a screen the saved order does not know, so a release never hides one', () => {
    // Saved before "invoices" existed.
    const out = applyNavSettings(ITEMS, { order: ['jobs', 'dashboard', 'clients'], hidden: [] });
    expect(keys(out)).toEqual(['jobs', 'dashboard', 'clients', 'invoices', 'admin']);
  });

  it('ignores a saved key whose screen no longer exists and a duplicate', () => {
    const out = applyNavSettings(ITEMS, { order: ['gone', 'jobs', 'jobs'], hidden: ['gone'] });
    expect(keys(out)).toEqual(['jobs', 'dashboard', 'clients', 'invoices', 'admin']);
  });

  it('keeps a pinned item last and visible whatever the settings say', () => {
    const out = applyNavSettings(ITEMS, { order: ['admin', 'jobs'], hidden: ['admin'] });
    expect(keys(out)).toEqual(['jobs', 'dashboard', 'clients', 'invoices', 'admin']);
  });
});

describe('editableNavOrder and toNavSettings', () => {
  it('round-trips the editor state', () => {
    const settings = { order: ['clients', 'jobs', 'dashboard', 'invoices'], hidden: ['jobs'] };
    const ordered = editableNavOrder(ITEMS, settings);
    expect(keys(ordered)).toEqual(['clients', 'jobs', 'dashboard', 'invoices', 'admin']);
    expect(toNavSettings(ordered, new Set(['jobs', 'admin']))).toEqual({
      order: ['clients', 'jobs', 'dashboard', 'invoices'],
      hidden: ['jobs'],
    });
  });
});

describe('parseOrganizationSettings', () => {
  it('gives defaults for no row and tolerates malformed columns', () => {
    expect(parseOrganizationSettings(null).nav).toEqual({ order: [], hidden: [] });
    const parsed = parseOrganizationSettings({
      organization_id: 'x',
      nav: { order: ['jobs', 3, null], hidden: 'nope' },
      labels: [],
      custom_fields: null,
    });
    expect(parsed.nav).toEqual({ order: ['jobs'], hidden: [] });
    expect(parsed.labels).toEqual({});
    expect(parsed.customFields).toEqual({});
  });
});
