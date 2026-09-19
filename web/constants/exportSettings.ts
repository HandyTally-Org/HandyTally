// HT-25: organization_settings.export, the Admin > Export options, and the
// pure rules that hang off them (payment terms <-> due date). The document is
// jsonb with a '{}' default in the database; every key is optional and takes
// the default below when missing or malformed, so a row written before HT-25
// reads the same as a fresh one.

/** Payment terms an invoice can carry (invoices.terms). */
export type PaymentTerms = 'due_on_receipt' | 'net_15' | 'net_30' | 'net_60';

export const PAYMENT_TERMS: readonly PaymentTerms[] = ['due_on_receipt', 'net_15', 'net_30', 'net_60'];

/** Days added to the issue date for each term. */
export const TERMS_DAYS: Record<PaymentTerms, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
};

/** What QuickBooks Online calls each term in its invoice import ("Terms" column). */
export const TERMS_LABELS: Record<PaymentTerms, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_60: 'Net 60',
};

export type ExportDateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY';

export type ExportSettings = {
  /** Written into the QBO Customers "Country" column when a client has none. */
  country: string;
  /** Default terms for a new invoice; drives its due date. */
  terms: PaymentTerms;
  /** Date format written into the QBO Invoices CSV; QBO asks for it at import. */
  dateFormat: ExportDateFormat;
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  country: 'United States',
  terms: 'net_30',
  dateFormat: 'MM/DD/YYYY',
};

export const isPaymentTerms = (value: unknown): value is PaymentTerms =>
  typeof value === 'string' && (PAYMENT_TERMS as readonly string[]).includes(value);

const isDateFormat = (value: unknown): value is ExportDateFormat => value === 'MM/DD/YYYY' || value === 'DD/MM/YYYY';

/** Turn the jsonb document into settings, tolerating anything it might hold. */
export function parseExportSettings(value: unknown): ExportSettings {
  const doc = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const country = typeof doc.country === 'string' && doc.country.trim() ? doc.country.trim() : DEFAULT_EXPORT_SETTINGS.country;
  return {
    country,
    terms: isPaymentTerms(doc.terms) ? doc.terms : DEFAULT_EXPORT_SETTINGS.terms,
    dateFormat: isDateFormat(doc.date_format) ? doc.date_format : DEFAULT_EXPORT_SETTINGS.dateFormat,
  };
}

/** The jsonb document to store for these settings (snake_case keys, like the other documents). */
export function toExportDocument(settings: ExportSettings): Record<string, unknown> {
  return { country: settings.country, terms: settings.terms, date_format: settings.dateFormat };
}

/** Add a term's days to an ISO date (YYYY-MM-DD), in calendar days, no time zone drift. */
export function dueDateForTerms(issueDate: string, terms: PaymentTerms): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(issueDate);
  if (!m) return issueDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + TERMS_DAYS[terms]));
  return d.toISOString().slice(0, 10);
}

/**
 * The terms an older invoice implies from its dates: exactly 0 / 15 / 30 / 60
 * days apart maps to a term, anything else is null (QBO then takes the dates
 * as given). Used when invoices.terms is null.
 */
export function termsFromDates(issueDate: string | null | undefined, dueDate: string | null | undefined): PaymentTerms | null {
  if (!issueDate || !dueDate) return null;
  const a = Date.parse(issueDate.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(dueDate.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / 86_400_000);
  const match = (Object.keys(TERMS_DAYS) as PaymentTerms[]).find(t => TERMS_DAYS[t] === days);
  return match ?? null;
}
