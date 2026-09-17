// HT-52: custom field definitions (organization_settings.custom_fields) and
// the pure rules for keys, validation and display. Values live on the record
// (`<table>.custom_fields`, keyed by the definition's key) and are rendered
// by components/CustomFields.tsx.

/** The record sections that can carry custom fields. Jobs and invoices arrive with HT-53. */
export type CustomFieldSection = 'clients' | 'materials' | 'services' | 'jobs' | 'invoices';

export const CUSTOM_FIELD_TYPES = ['text', 'long_text', 'number', 'date', 'boolean', 'dropdown'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes / no',
  dropdown: 'Dropdown',
};

export type CustomFieldDef = {
  /** Stored key; generated from the label and read-only after save. */
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  /** Dropdown choices; the record stores the option text, not an index. */
  options?: string[];
};

export type OrganizationCustomFields = Partial<Record<CustomFieldSection, CustomFieldDef[]>>;

/** A record's values, keyed by field key. Types follow the definition; anything else is shown as text. */
export type CustomFieldValues = Record<string, unknown>;

const SECTIONS: readonly CustomFieldSection[] = ['clients', 'materials', 'services', 'jobs', 'invoices'];

/** Which settings section a sidebar entry configures. */
export const NAV_KEY_TO_SECTION: Record<string, CustomFieldSection> = {
  clients: 'clients',
  inventory: 'materials',
  labor: 'services',
  jobs: 'jobs',
  invoices: 'invoices',
};

function isType(value: unknown): value is CustomFieldType {
  return typeof value === 'string' && (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

/** Read the jsonb document, dropping anything malformed rather than failing a screen. */
export function parseCustomFieldDefs(raw: unknown): OrganizationCustomFields {
  const out: OrganizationCustomFields = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const section of SECTIONS) {
    const list = (raw as Record<string, unknown>)[section];
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    const defs: CustomFieldDef[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.key !== 'string' || !e.key || seen.has(e.key) || !isType(e.type)) continue;
      seen.add(e.key);
      defs.push({
        key: e.key,
        label: typeof e.label === 'string' && e.label ? e.label : e.key,
        type: e.type,
        required: e.required === true,
        options:
          e.type === 'dropdown' && Array.isArray(e.options)
            ? e.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map(o => o.trim())
            : undefined,
      });
    }
    out[section] = defs;
  }
  return out;
}

/**
 * "Site contact" -> "site_contact". Empty labels fall back to "field", and a
 * key already taken gets a numeric suffix, so two definitions never share a
 * key and stored values never end up under an empty one.
 */
export function generateFieldKey(label: string, taken: Iterable<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** "Red, Green,, Blue " -> ["Red", "Green", "Blue"], de-duplicated. */
export function parseOptions(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(',')) {
    const option = part.trim();
    if (option && !out.includes(option)) out.push(option);
  }
  return out;
}

/** True when a value counts as filled in for a required check. */
export function hasCustomValue(def: CustomFieldDef, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (def.type === 'boolean') return typeof value === 'boolean';
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

/** Errors keyed by field key; empty when the values are acceptable. */
export function validateCustomValues(defs: readonly CustomFieldDef[], values: CustomFieldValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const value = values[def.key];
    if (def.required && !hasCustomValue(def, value)) {
      errors[def.key] = `${def.label} is required`;
      continue;
    }
    if (!hasCustomValue(def, value)) continue;
    if (def.type === 'number' && !Number.isFinite(Number(value))) errors[def.key] = 'Enter a number';
    if (def.type === 'date' && typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[def.key] = 'Use YYYY-MM-DD';
  }
  return errors;
}

/**
 * What to store: numbers as numbers, blanks dropped, unknown keys kept so a
 * value under a deleted definition survives until it is purged on purpose.
 */
export function normalizeCustomValues(defs: readonly CustomFieldDef[], values: CustomFieldValues): CustomFieldValues {
  const out: CustomFieldValues = { ...values };
  for (const def of defs) {
    const value = out[def.key];
    if (!hasCustomValue(def, value)) {
      delete out[def.key];
      continue;
    }
    if (def.type === 'number') out[def.key] = Number(value);
    else if (def.type === 'boolean') out[def.key] = value === true;
    else if (typeof value === 'string') out[def.key] = value.trim();
  }
  return out;
}

/** The value as a detail page shows it. */
export function formatCustomValue(def: CustomFieldDef, value: unknown): string {
  if (!hasCustomValue(def, value)) return '';
  if (def.type === 'boolean') return value === true ? 'Yes' : 'No';
  return String(value);
}
