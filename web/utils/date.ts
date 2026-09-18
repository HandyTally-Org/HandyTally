// HT-76: the one place that masks a free-text date input as the user types,
// parses it back to the ISO date that gets stored, and formats a stored ISO
// date for display. Storage stays ISO (YYYY-MM-DD) everywhere so sorting and
// the Excel export (utils/excel.ts) keep working; only the input mask and
// the display format are US (MM/DD/YYYY).

/** "10152026" -> "10/15/2026", inserting slashes progressively as digits arrive. */
export function maskDateInput(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isRealCalendarDate(month: number, day: number, year: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Parses a complete `MM/DD/YYYY` or legacy `YYYY-MM-DD` string to an ISO
 * `YYYY-MM-DD` date, or null when the text isn't a complete, real date.
 */
export function parseUsDate(text: string): string | null {
  const trimmed = text.trim();

  const us = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (us) {
    const [, mm, dd, yyyy] = us;
    if (!isRealCalendarDate(Number(mm), Number(dd), Number(yyyy))) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    if (!isRealCalendarDate(Number(mm), Number(dd), Number(yyyy))) return null;
    return trimmed;
  }

  return null;
}

/** Formats a stored ISO `YYYY-MM-DD` date as `MM/DD/YYYY`; anything else is returned as-is. */
export function formatUsDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const [, yyyy, mm, dd] = match;
  return `${mm}/${dd}/${yyyy}`;
}
