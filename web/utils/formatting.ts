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
 * Format a phone number
 * @param phone Phone number to format
 * @returns Formatted phone number
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format as (XXX) XXX-XXXX
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // Return original if not 10 digits
  return phone;
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
};

/**
 * HT-56: join a client's address, city, state and zip as
 * `"{address}, {city}, {state} {zip}"`, skipping empty parts so there are no
 * dangling separators. Returns '' when every part is empty.
 */
export function formatClientAddress(client: ClientAddressParts | null | undefined): string {
  if (!client) return '';

  const text = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).trim();

  // numeric zips: drop any decimal tail ("18503.00" -> "18503"), never add separators.
  const zip = text(client.zip).replace(/\.0*$/, '');
  const stateZip = [text(client.state), zip].filter(Boolean).join(' ');

  return [text(client.address), text(client.city), stateZip].filter(Boolean).join(', ');
}
