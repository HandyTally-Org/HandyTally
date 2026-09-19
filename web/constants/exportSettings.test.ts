import {
  DEFAULT_EXPORT_SETTINGS,
  dueDateForTerms,
  parseExportSettings,
  termsFromDates,
  toExportDocument,
} from './exportSettings';

describe('parseExportSettings', () => {
  it('returns the defaults for a missing or empty document', () => {
    expect(parseExportSettings(undefined)).toEqual(DEFAULT_EXPORT_SETTINGS);
    expect(parseExportSettings({})).toEqual(DEFAULT_EXPORT_SETTINGS);
    expect(parseExportSettings('nope')).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it('reads valid keys and ignores malformed ones', () => {
    expect(parseExportSettings({ country: ' Canada ', terms: 'net_15', date_format: 'DD/MM/YYYY' })).toEqual({
      country: 'Canada',
      terms: 'net_15',
      dateFormat: 'DD/MM/YYYY',
    });
    expect(parseExportSettings({ country: '', terms: 'net_45', date_format: 'YYYY-MM-DD' })).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it('round-trips through the stored document', () => {
    const s = { country: 'Canada', terms: 'net_60' as const, dateFormat: 'DD/MM/YYYY' as const };
    expect(parseExportSettings(toExportDocument(s))).toEqual(s);
  });
});

describe('dueDateForTerms', () => {
  it('adds the term days in calendar days', () => {
    expect(dueDateForTerms('2026-09-18', 'due_on_receipt')).toBe('2026-09-18');
    expect(dueDateForTerms('2026-09-18', 'net_15')).toBe('2026-10-03');
    expect(dueDateForTerms('2026-09-18', 'net_30')).toBe('2026-10-18');
    expect(dueDateForTerms('2026-12-20', 'net_60')).toBe('2027-02-18');
  });

  it('leaves a non-ISO value alone', () => {
    expect(dueDateForTerms('', 'net_30')).toBe('');
  });
});

describe('termsFromDates', () => {
  it('recognises the four standard gaps', () => {
    expect(termsFromDates('2026-09-18', '2026-09-18')).toBe('due_on_receipt');
    expect(termsFromDates('2026-09-18', '2026-10-03')).toBe('net_15');
    expect(termsFromDates('2026-09-18', '2026-10-18')).toBe('net_30');
    expect(termsFromDates('2026-09-18', '2026-11-17')).toBe('net_60');
  });

  it('is null for any other gap or missing date', () => {
    expect(termsFromDates('2026-09-18', '2026-09-25')).toBeNull();
    expect(termsFromDates('2026-09-18', null)).toBeNull();
    expect(termsFromDates(undefined, '2026-09-18')).toBeNull();
  });
});
