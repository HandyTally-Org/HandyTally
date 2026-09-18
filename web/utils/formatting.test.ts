import { formatClientAddress, formatDateTime, formatEin } from './formatting';

describe('formatClientAddress', () => {
  it('joins all four parts as "address, city, state zip"', () => {
    expect(
      formatClientAddress({ address: '1234 Big St', city: 'Scranton', state: 'PA', zip: 18503 })
    ).toBe('1234 Big St, Scranton, PA 18503');
  });

  it('skips empty parts without leaving dangling separators', () => {
    expect(formatClientAddress({ address: '1234 Big St', city: null, state: 'PA', zip: null })).toBe(
      '1234 Big St, PA'
    );
    expect(formatClientAddress({ address: '', city: 'Scranton', state: '', zip: 18503 })).toBe(
      'Scranton, 18503'
    );
    expect(formatClientAddress({ address: ' 1 Main St ', city: ' Boston ', state: undefined, zip: '' })).toBe(
      '1 Main St, Boston'
    );
  });

  it('renders a numeric zip as a plain string', () => {
    expect(formatClientAddress({ state: 'PA', zip: '18503.00' })).toBe('PA 18503');
    expect(formatClientAddress({ state: 'PA', zip: 18503 })).toBe('PA 18503');
  });

  it('is blank when every part is empty', () => {
    expect(formatClientAddress({ address: null, city: null, state: null, zip: null })).toBe('');
    expect(formatClientAddress({})).toBe('');
    expect(formatClientAddress(null)).toBe('');
  });
});

describe('formatDateTime', () => {
  it('formats in local time as MM/DD/YYYY hh:mm AM/PM', () => {
    // Built in local time so the expectation holds in any time zone.
    expect(formatDateTime(new Date(2026, 8, 19, 8, 0).toISOString())).toBe('09/19/2026 08:00 AM');
    expect(formatDateTime(new Date(2026, 0, 5, 0, 7).toISOString())).toBe('01/05/2026 12:07 AM');
    expect(formatDateTime(new Date(2026, 11, 31, 12, 30).toISOString())).toBe('12/31/2026 12:30 PM');
    expect(formatDateTime(new Date(2026, 8, 19, 14, 5).toISOString())).toBe('09/19/2026 02:05 PM');
  });

  it('is blank for empty or invalid input', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime('not a date')).toBe('');
  });
});

describe('formatEin', () => {
  it('inserts the dash progressively as digits arrive', () => {
    expect(formatEin('88883848')).toBe('88-883848');
    expect(formatEin('11111111111')).toBe('11-1111111');
    expect(formatEin('12-3456789')).toBe('12-3456789');
    expect(formatEin('1')).toBe('1');
    expect(formatEin('ab12')).toBe('12');
  });

  it('is blank for empty input', () => {
    expect(formatEin(null)).toBe('');
    expect(formatEin(undefined)).toBe('');
    expect(formatEin('')).toBe('');
  });
});
