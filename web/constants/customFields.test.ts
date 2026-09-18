import {
  formatCustomValue,
  generateFieldKey,
  normalizeCustomValues,
  parseCustomFieldDefs,
  parseOptions,
  validateCustomValues,
  type CustomFieldDef,
} from './customFields';

describe('generateFieldKey', () => {
  it('slugs the label', () => {
    expect(generateFieldKey('Site contact', [])).toBe('site_contact');
    expect(generateFieldKey('  PO # (2024)  ', [])).toBe('po_2024');
    expect(generateFieldKey('Café', [])).toBe('cafe');
  });

  it('never returns an empty key and never collides', () => {
    expect(generateFieldKey('!!!', [])).toBe('field');
    expect(generateFieldKey('Notes', ['notes'])).toBe('notes_2');
    expect(generateFieldKey('Notes', ['notes', 'notes_2'])).toBe('notes_3');
  });
});

describe('parseOptions', () => {
  it('splits, trims, drops blanks and duplicates', () => {
    expect(parseOptions('Red, Green,, Blue , Red')).toEqual(['Red', 'Green', 'Blue']);
  });
});

describe('parseCustomFieldDefs', () => {
  it('keeps well-formed definitions and drops the rest', () => {
    const defs = parseCustomFieldDefs({
      clients: [
        { key: 'po', label: 'PO number', type: 'text', required: true },
        { key: 'colour', label: 'Colour', type: 'dropdown', options: ['Red', ' ', 'Blue '] },
        { key: 'po', label: 'duplicate', type: 'text' },
        { key: '', label: 'no key', type: 'text' },
        { key: 'bad', label: 'bad type', type: 'file' },
      ],
      jobs: 'not a list',
    });
    expect(defs.clients).toEqual([
      { key: 'po', label: 'PO number', type: 'text', required: true, options: undefined },
      { key: 'colour', label: 'Colour', type: 'dropdown', required: false, options: ['Red', 'Blue'] },
    ]);
    expect(defs.jobs).toBeUndefined();
    expect(parseCustomFieldDefs(null)).toEqual({});
  });
});

const DEFS: CustomFieldDef[] = [
  { key: 'po', label: 'PO number', type: 'text', required: true },
  { key: 'qty', label: 'Quantity', type: 'number', required: false },
  { key: 'due', label: 'Due', type: 'date', required: false },
  { key: 'ok', label: 'Approved', type: 'boolean', required: true },
];

describe('validateCustomValues', () => {
  it('enforces required and type formats', () => {
    expect(validateCustomValues(DEFS, { po: ' ', qty: 'abc', due: '3/4/26', ok: true })).toEqual({
      po: 'PO number is required',
      qty: 'Enter a number',
      due: 'Use YYYY-MM-DD',
    });
    expect(validateCustomValues(DEFS, { po: '44', ok: false })).toEqual({});
    // A yes/no that was never touched is not "no".
    expect(validateCustomValues(DEFS, { po: '44' })).toEqual({ ok: 'Approved is required' });
  });
});

describe('normalizeCustomValues', () => {
  it('stores numbers as numbers, drops blanks, keeps values under deleted definitions', () => {
    expect(normalizeCustomValues(DEFS, { po: ' 44 ', qty: '3', due: '', ok: true, old_field: 'kept' })).toEqual({
      po: '44',
      qty: 3,
      ok: true,
      old_field: 'kept',
    });
  });
});

describe('formatCustomValue', () => {
  it('shows yes/no for booleans and blanks for missing values', () => {
    expect(formatCustomValue(DEFS[3], true)).toBe('Yes');
    expect(formatCustomValue(DEFS[3], false)).toBe('No');
    expect(formatCustomValue(DEFS[0], undefined)).toBe('');
    expect(formatCustomValue(DEFS[1], 3)).toBe('3');
  });
});
