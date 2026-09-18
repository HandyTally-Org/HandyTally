import { formatUsDate, maskDateInput, parseUsDate } from './date';

describe('maskDateInput', () => {
  it('inserts slashes progressively as digits arrive', () => {
    expect(maskDateInput('1')).toBe('1');
    expect(maskDateInput('10')).toBe('10');
    expect(maskDateInput('101')).toBe('10/1');
    expect(maskDateInput('1015')).toBe('10/15');
    expect(maskDateInput('10152')).toBe('10/15/2');
    expect(maskDateInput('10152026')).toBe('10/15/2026');
  });

  it('strips non-digits and caps at 8 digits', () => {
    expect(maskDateInput('10/15/2026')).toBe('10/15/2026');
    expect(maskDateInput('10152026999')).toBe('10/15/2026');
  });
});

describe('parseUsDate', () => {
  it('parses a complete MM/DD/YYYY to ISO', () => {
    expect(parseUsDate('10/15/2026')).toBe('2026-10-15');
    expect(parseUsDate('01/01/2026')).toBe('2026-01-01');
  });

  it('accepts legacy YYYY-MM-DD for back-compat', () => {
    expect(parseUsDate('2026-10-15')).toBe('2026-10-15');
  });

  it('rejects impossible calendar dates', () => {
    expect(parseUsDate('02/30/2026')).toBeNull();
    expect(parseUsDate('13/01/2026')).toBeNull();
  });

  it('rejects incomplete or malformed text', () => {
    expect(parseUsDate('10/15')).toBeNull();
    expect(parseUsDate('3/4/26')).toBeNull();
    expect(parseUsDate('')).toBeNull();
    expect(parseUsDate('not a date')).toBeNull();
  });
});

describe('formatUsDate', () => {
  it('formats a stored ISO date as MM/DD/YYYY', () => {
    expect(formatUsDate('2026-10-15')).toBe('10/15/2026');
  });

  it('is blank for empty input and passes through anything unrecognized', () => {
    expect(formatUsDate(null)).toBe('');
    expect(formatUsDate(undefined)).toBe('');
    expect(formatUsDate('')).toBe('');
    expect(formatUsDate('garbage')).toBe('garbage');
  });
});
