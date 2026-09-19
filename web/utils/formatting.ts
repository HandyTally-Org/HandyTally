// Create the formatting utility functions

/**
 * Format a number as currency
 * @param value Number to format as currency
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '$0.00';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numValue);
}

/**
 * Format a date string
 * @param dateString Date string to format
 * @returns Formatted date string
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
}

/**
 * HT-77: mask a company EIN as NN-NNNNNNN progressively as it's typed,
 * capping at 9 digits so it can't grow past a real EIN's length.
 * @param value Raw or partially-typed EIN text
 * @returns Masked EIN, or '' when empty
 */
export function formatEin(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 9);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/**
 * HT-82: mask a North American phone number as `+1 (XXX) XXX-XXXX`
 * progressively as it is typed, so it can drive a controlled input the way
 * formatEin does. A leading country code 1 on an 11-digit number is folded
 * into the fixed `+1`; anything past 10 national digits is dropped.
 *
 * Closing punctuation only appears once the digit after it exists, so
 * backspacing over ")" or "-" removes a digit instead of getting stuck.
 * @param value Raw, pasted or partially-typed phone text
 * @returns Masked number, or '' when empty
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  // The mask's own "+1 " prefix (or a pasted "+1") is not a national digit.
  const national = value.trim().startsWith('+1') ? value.trim().slice(2) : value;
  let digits = national.replace(/\D/g, '');
  if (!value.trim().startsWith('+1') && digits.length >= 11 && digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';

  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  const line = digits.slice(6, 10);
  if (digits.length <= 3) return `+1 (${area}`;
  if (digits.length <= 6) return `+1 (${area}) ${exchange}`;
  return `+1 (${area}) ${exchange}-${line}`;
}

/**
 * HT-56: format a timestamp as `MM/DD/YYYY hh:mm AM/PM` in the browser's
 * local time zone, the same shape the job edit form uses.
 * @param dateString ISO timestamp (or anything `new Date` accepts)
 * @returns Formatted date-time, or '' when empty/invalid
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours24 = date.getHours();
  const hours12 = String(hours24 % 12 || 12).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const amPm = hours24 < 12 ? 'AM' : 'PM';

  return `${month}/${day}/${year} ${hours12}:${minutes} ${amPm}`;
}

/** The client columns that make up a postal address. */
export type ClientAddressParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  /** clients.zip is numeric in the database, so it may arrive as a number or a numeric string. */
  zip?: number | string | null;
  /** HT-25: the text ZIP ("02134", "02134-1234"); preferred over zip when set. */
  postal_code?: string | null;
};

/**
 * HT-25: the ZIP to show for a client. postal_code is the text column that
 * keeps leading zeros and ZIP+4; zip is the older numeric column that the
 * v1.5.0 bundle still writes (a trigger keeps the two in step). Prefer
 * postal_code; fall back to zip with its decimal tail dropped and padded
 * back to five digits.
 */
export function clientPostalCode(client: Pick<ClientAddressParts, 'zip' | 'postal_code'> | null | undefined): string {
  if (!client) return '';
  const postal = (client.postal_code ?? '').trim();
  if (postal) return postal;
  const zip = client.zip === null || client.zip === undefined ? '' : String(client.zip).trim().replace(/\.0*$/, '');
  return /^\d{1,4}$/.test(zip) ? zip.padStart(5, '0') : zip;
}

/**
 * HT-56: join a client's address, city, state and zip as
 * `"{address}, {city}, {state} {zip}"`, skipping empty parts so there are no
 * dangling separators. Returns '' when every part is empty.
 */
export function formatClientAddress(client: ClientAddressParts | null | undefined): string {
  if (!client) return '';

  const text = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).trim();

  const zip = clientPostalCode(client);
  const stateZip = [text(client.state), zip].filter(Boolean).join(' ');

  return [text(client.address), text(client.city), stateZip].filter(Boolean).join(', ');
}
