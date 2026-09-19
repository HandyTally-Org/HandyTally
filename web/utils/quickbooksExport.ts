// HT-25: build the two files QuickBooks Online's Import Data screens take,
// column for column as Intuit's samples lay them out
// (QuickBooks_Online_Customer_Sample_File.xls, sample_invoice_import_ship.csv).
// Pure functions: the Export page fetches the rows and hands them here; this
// module never touches the network or the DOM, so every rule is unit-tested.
//
// Two kinds of result:
//   * blockers  — the export is not produced (QBO would merge or reject rows:
//                 duplicate customer names, duplicate invoice numbers).
//   * warnings  — the file is produced, the bookkeeper is told what to check
//                 (recomputed line amounts, totals that do not add up, paid
//                 invoices that QBO will import as open).

import { clientPostalCode } from './formatting';
import { TERMS_LABELS, termsFromDates, isPaymentTerms, type ExportDateFormat, type ExportSettings } from '../constants/exportSettings';
import { normalizeItemType } from './invoiceItems';

// ---------------------------------------------------------------------------
// Inputs, as the page selects them
// ---------------------------------------------------------------------------

export type ExportClient = {
  uid: number | string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: number | string | null;
  postal_code?: string | null;
  tag?: string | null;
};

export type ExportInvoiceItem = {
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  amount?: number | string | null;
  type?: string | null;
  service_id?: number | string | null;
  material_id?: number | string | null;
  taxable?: boolean | null;
};

export type ExportInvoice = {
  uid: number | string;
  invoice_number?: string | number | null;
  client_id?: number | string | null;
  job_id?: number | string | null;
  issue_date?: string | null;
  due_date?: string | null;
  terms?: string | null;
  status?: string | null;
  notes?: string | null;
  fee_type?: string | null;
  fee_amount?: number | string | null;
  tax_rate?: number | string | null;
  total?: number | string | null;
  invoice_items?: ExportInvoiceItem[] | null;
};

export type ExportJob = { uid: number | string; start_date?: string | null };
export type ExportCatalogItem = { uid?: number | string; id?: number | string; name?: string | null };

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type ExportProblem = { code: string; message: string; records: string[] };

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** Round half away from zero to cents, avoiding 1.005 -> 1.00 float traps. */
export const roundCents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** ISO date (YYYY-MM-DD…) to the format QBO is told to expect at import. */
export function formatExportDate(value: string | null | undefined, format: ExportDateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));
  if (!m) return '';
  return format === 'DD/MM/YYYY' ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[3]}/${m[1]}`;
}

/** Group the records that share a key, keeping only keys that repeat. */
function duplicates<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  for (const [k, group] of groups) if (group.length < 2) groups.delete(k);
  return groups;
}

// ---------------------------------------------------------------------------
// Customers (.xlsx, sheet "Sheet1")
// ---------------------------------------------------------------------------

/** Header row, exactly as Intuit's customer sample has it. */
export const CUSTOMER_COLUMNS = [
  'Name', 'Company', 'Customer Type', 'Email', 'Phone', 'Mobile', 'Fax', 'Website',
  'Street', 'City', 'State', 'ZIP', 'Country', 'Opening Balance', 'Date', 'Resale Number',
] as const;

export type CustomerRow = Record<(typeof CUSTOMER_COLUMNS)[number], string>;

export type CustomersOptions = {
  /** Only clients with one of these tags; empty = every client. */
  tags?: string[];
  /**
   * Write each client's open balance (sum of open invoice totals) instead of
   * exporting the invoices themselves. Off by default: a balance and the
   * invoices together would double the receivable in QBO.
   */
  openingBalance?: boolean;
  /** Today's date, ISO, for the "Date" column when openingBalance is on. */
  asOf?: string;
};

/** Statuses whose total is still owed (mirrors OPEN_INVOICE_STATUSES minus documents that are not invoices yet). */
export const OPEN_BALANCE_STATUSES = ['sent', 'partial_paid', 'overdue'];

export type CustomersResult = {
  rows: CustomerRow[];
  blockers: ExportProblem[];
};

export function buildCustomersRows(
  clients: ExportClient[],
  settings: ExportSettings,
  options: CustomersOptions = {},
  invoices: ExportInvoice[] = [],
): CustomersResult {
  const tags = (options.tags ?? []).filter(Boolean);
  const selected = clients.filter(c => text(c.name) && (tags.length === 0 || tags.includes(text(c.tag))));

  // QBO keys customers on Name; two clients with the same name would be
  // merged or rejected, so the export stops until they are told apart.
  const dupes = duplicates(selected, c => text(c.name).toLowerCase());
  const blockers: ExportProblem[] = [];
  if (dupes.size > 0) {
    blockers.push({
      code: 'duplicate_client_names',
      message: 'QuickBooks uses the customer name as its key. Rename these clients so each name is unique, then export again.',
      records: [...dupes.values()].map(group => `${text(group[0].name)} (${group.length} clients: ${group.map(c => `#${c.uid}`).join(', ')})`),
    });
  }

  const balances = new Map<string, number>();
  if (options.openingBalance) {
    for (const inv of invoices) {
      if (!OPEN_BALANCE_STATUSES.includes(text(inv.status))) continue;
      const key = text(inv.client_id);
      balances.set(key, (balances.get(key) ?? 0) + num(inv.total));
    }
  }
  const asOf = formatExportDate(options.asOf ?? new Date().toISOString().slice(0, 10), settings.dateFormat);

  const rows: CustomerRow[] = selected.map(c => {
    const balance = options.openingBalance ? balances.get(text(c.uid)) ?? 0 : 0;
    return {
      Name: text(c.name),
      Company: text(c.company),
      'Customer Type': '',
      Email: text(c.email),
      Phone: text(c.phone),
      Mobile: text(c.mobile),
      Fax: '',
      Website: text(c.website),
      Street: text(c.address),
      City: text(c.city),
      State: text(c.state),
      // Text on purpose: "02134" must not become 2134 in the sheet either.
      ZIP: clientPostalCode(c),
      Country: settings.country,
      'Opening Balance': options.openingBalance && balance > 0 ? roundCents(balance).toFixed(2) : '',
      Date: options.openingBalance && balance > 0 ? asOf : '',
      'Resale Number': '',
    };
  });

  return { rows, blockers };
}

// ---------------------------------------------------------------------------
// Invoices (.csv, one row per line item)
// ---------------------------------------------------------------------------

/** Header row for the invoice CSV. Starred columns are required by QBO. */
export const INVOICE_COLUMNS = [
  '*InvoiceNo', '*Customer', '*InvoiceDate', '*DueDate', 'Terms', 'Location', 'Memo',
  'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', '*ItemAmount',
  'Taxable', 'TaxRate', 'Service Date',
] as const;

export type InvoiceCsvRow = Record<(typeof INVOICE_COLUMNS)[number], string>;

/** Statuses QBO's invoice importer can take. Estimates, work orders and cancelled documents never go. */
export const EXPORTABLE_INVOICE_STATUSES = ['sent', 'partial_paid', 'paid', 'overdue'];
export const EXCLUDED_INVOICE_STATUSES: Record<string, string> = {
  estimate: 'QuickBooks imports invoices only; estimates use a different importer.',
  work_order: 'A work order is not an invoice yet.',
  cancelled: 'Cancelled documents have nothing to collect.',
};

/** QBO refuses a file with more than this many rows (header excluded). */
export const QBO_MAX_ROWS = 1000;

/** QBO's sub-item separator; an item name containing it would be read as "parent:child". */
const ITEM_NAME_MAX = 100;
export const itemName = (value: string): string => text(value).replace(/:/g, ' ').replace(/\s+/g, ' ').trim().slice(0, ITEM_NAME_MAX);

export type InvoicesOptions = {
  /** ISO dates, inclusive, on issue_date; either side may be omitted. */
  from?: string;
  to?: string;
  /** Statuses to include; defaults to every exportable status. */
  statuses?: string[];
};

export type InvoicesResult = {
  /** The CSV rows, invoice by invoice, before splitting into files. */
  rows: InvoiceCsvRow[];
  /** Serialised files, each at most QBO_MAX_ROWS rows and never splitting an invoice. */
  files: string[];
  blockers: ExportProblem[];
  warnings: ExportProblem[];
  /** Counts for the summary line. */
  summary: { invoices: number; rows: number; files: number; excluded: number };
};

type Catalog = { materials?: ExportCatalogItem[]; services?: ExportCatalogItem[] };

const byId = (items: ExportCatalogItem[] | undefined): Map<string, string> => {
  const map = new Map<string, string>();
  for (const item of items ?? []) {
    const id = text(item.uid ?? item.id);
    if (id) map.set(id, text(item.name));
  }
  return map;
};

export function buildInvoicesCsv(
  invoices: ExportInvoice[],
  clients: ExportClient[],
  jobs: ExportJob[],
  catalog: Catalog,
  settings: ExportSettings,
  options: InvoicesOptions = {},
): InvoicesResult {
  const statuses = options.statuses?.length ? options.statuses.filter(s => EXPORTABLE_INVOICE_STATUSES.includes(s)) : EXPORTABLE_INVOICE_STATUSES;
  const clientName = new Map(clients.map(c => [text(c.uid), text(c.name)]));
  const jobStart = new Map(jobs.map(j => [text(j.uid), text(j.start_date)]));
  const materialName = byId(catalog.materials);
  const serviceName = byId(catalog.services);

  const inRange = (inv: ExportInvoice): boolean => {
    const d = text(inv.issue_date).slice(0, 10);
    if (options.from && d < options.from) return false;
    if (options.to && d > options.to) return false;
    return true;
  };

  const selected = invoices
    .filter(inv => statuses.includes(text(inv.status)) && inRange(inv))
    .sort((a, b) => text(a.issue_date).localeCompare(text(b.issue_date)) || text(a.invoice_number).localeCompare(text(b.invoice_number), undefined, { numeric: true }));
  const excluded = invoices.filter(inv => !statuses.includes(text(inv.status)) && inRange(inv)).length;

  const blockers: ExportProblem[] = [];
  const warnings: ExportProblem[] = [];

  const dupeNumbers = duplicates(selected, inv => text(inv.invoice_number));
  if (dupeNumbers.size > 0) {
    blockers.push({
      code: 'duplicate_invoice_numbers',
      message: 'QuickBooks rejects a repeated invoice number when custom transaction numbers are on. Renumber these invoices, then export again.',
      records: [...dupeNumbers.entries()].map(([n, group]) => `#${n} (${group.length} invoices)`),
    });
  }
  const missingNumber = selected.filter(inv => !text(inv.invoice_number));
  if (missingNumber.length > 0) {
    blockers.push({
      code: 'missing_invoice_numbers',
      message: 'Every invoice needs a number for the *InvoiceNo column.',
      records: missingNumber.map(inv => `invoice id ${inv.uid}`),
    });
  }
  const missingClient = selected.filter(inv => !clientName.get(text(inv.client_id)));
  if (missingClient.length > 0) {
    blockers.push({
      code: 'missing_client',
      message: 'These invoices have no client, or a client with no name; QBO needs *Customer on every invoice.',
      records: missingClient.map(inv => `#${text(inv.invoice_number) || inv.uid}`),
    });
  }

  const recomputed: string[] = [];
  const mismatched: string[] = [];
  const paid: string[] = [];
  const rows: InvoiceCsvRow[] = [];
  const perInvoice: InvoiceCsvRow[][] = [];

  for (const inv of selected) {
    const number = text(inv.invoice_number);
    const customer = clientName.get(text(inv.client_id)) ?? '';
    const taxRate = num(inv.tax_rate);
    const taxed = taxRate > 0;
    const terms = isPaymentTerms(inv.terms) ? inv.terms : termsFromDates(inv.issue_date, inv.due_date);
    const memo = text(inv.notes).replace(/\s*[\r\n]+\s*/g, ' ');
    const serviceDate = inv.job_id ? formatExportDate(jobStart.get(text(inv.job_id)), settings.dateFormat) : '';

    const lines: InvoiceCsvRow[] = [];
    const blank = (): InvoiceCsvRow => ({
      '*InvoiceNo': '', '*Customer': '', '*InvoiceDate': '', '*DueDate': '', Terms: '', Location: '', Memo: '',
      'Item(Product/Service)': '', ItemDescription: '', ItemQuantity: '', ItemRate: '', '*ItemAmount': '',
      Taxable: '', TaxRate: '', 'Service Date': '',
    });

    let lineSum = 0;
    let taxableSum = 0;
    for (const item of inv.invoice_items ?? []) {
      const qty = num(item.quantity);
      const rate = num(item.unit_price);
      // QBO rejects a row whose amount is not qty x rate to the cent.
      const amount = roundCents(qty * rate);
      if (Math.abs(amount - roundCents(num(item.amount))) >= 0.005) recomputed.push(`#${number}: "${text(item.description).slice(0, 40)}"`);
      const type = normalizeItemType(item.type);
      const linked =
        type === 'material' ? materialName.get(text(item.material_id)) :
        type === 'service' ? serviceName.get(text(item.service_id)) : undefined;
      // A custom line becomes a generic item per type so every distinct
      // description does not turn into its own QBO item.
      const name = linked ? itemName(linked) : type === 'material' ? 'Materials' : type === 'service' ? 'Labor' : 'Other';
      const lineTaxable = taxed && item.taxable !== false;
      lineSum += amount;
      if (lineTaxable) taxableSum += amount;
      lines.push({
        ...blank(),
        'Item(Product/Service)': name,
        ItemDescription: text(item.description),
        ItemQuantity: String(qty),
        ItemRate: rate.toFixed(2),
        '*ItemAmount': amount.toFixed(2),
        Taxable: lineTaxable ? 'Y' : 'N',
        TaxRate: lineTaxable ? String(taxRate) : '',
        'Service Date': serviceDate,
      });
    }

    // The invoice-level fee has no QBO column: one extra line keeps the
    // totals equal. Fees are taxable in HandyTally.
    const fee = roundCents(num(inv.fee_amount));
    if (fee > 0) {
      lineSum += fee;
      if (taxed) taxableSum += fee;
      lines.push({
        ...blank(),
        'Item(Product/Service)': 'Service Fee',
        ItemDescription: `${inv.fee_type === 'percent' ? 'Percentage' : 'Fixed'} fee`,
        ItemQuantity: '1',
        ItemRate: fee.toFixed(2),
        '*ItemAmount': fee.toFixed(2),
        Taxable: taxed ? 'Y' : 'N',
        TaxRate: taxed ? String(taxRate) : '',
        'Service Date': serviceDate,
      });
    }

    if (lines.length === 0) {
      // QBO needs at least one line; an empty invoice goes as one zero line
      // so the number and dates still land.
      lines.push({ ...blank(), 'Item(Product/Service)': 'Other', ItemDescription: 'No line items', ItemQuantity: '1', ItemRate: '0.00', '*ItemAmount': '0.00', Taxable: 'N', TaxRate: '', 'Service Date': serviceDate });
    }

    // Header-level values on the first row only, as in Intuit's sample.
    Object.assign(lines[0], {
      '*InvoiceNo': number,
      '*Customer': customer,
      '*InvoiceDate': formatExportDate(inv.issue_date, settings.dateFormat),
      '*DueDate': formatExportDate(inv.due_date, settings.dateFormat),
      Terms: terms ? TERMS_LABELS[terms] : '',
      Memo: memo,
    });

    const expected = roundCents(lineSum + roundCents(taxableSum * taxRate / 100));
    if (Math.abs(expected - roundCents(num(inv.total))) >= 0.01) {
      mismatched.push(`#${number}: file total ${expected.toFixed(2)}, HandyTally total ${roundCents(num(inv.total)).toFixed(2)}`);
    }
    if (inv.status === 'paid' || inv.status === 'partial_paid') paid.push(`#${number} (${inv.status === 'paid' ? 'paid' : 'partially paid'})`);

    perInvoice.push(lines);
    rows.push(...lines);
  }

  if (recomputed.length > 0) {
    warnings.push({ code: 'recomputed_amounts', message: 'Line amounts were recomputed as quantity × rate, which QuickBooks requires. These lines differed from what was stored:', records: recomputed });
  }
  if (mismatched.length > 0) {
    warnings.push({ code: 'total_mismatch', message: 'The file total will not match the HandyTally total for these invoices. Check them after import:', records: mismatched });
  }
  if (paid.length > 0) {
    warnings.push({ code: 'paid_state_not_exported', message: 'QuickBooks imports every invoice as open. Record the payments in QuickBooks for:', records: paid });
  }

  const files = blockers.length > 0 ? [] : chunkInvoiceRows(perInvoice).map(toCsv);
  return {
    rows,
    files,
    blockers,
    warnings,
    summary: { invoices: selected.length, rows: rows.length, files: files.length, excluded },
  };
}

/** Split invoices into files of at most QBO_MAX_ROWS rows without splitting an invoice. */
export function chunkInvoiceRows(perInvoice: InvoiceCsvRow[][], max = QBO_MAX_ROWS): InvoiceCsvRow[][] {
  const chunks: InvoiceCsvRow[][] = [];
  let current: InvoiceCsvRow[] = [];
  for (const lines of perInvoice) {
    if (current.length > 0 && current.length + lines.length > max) {
      chunks.push(current);
      current = [];
    }
    current.push(...lines);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** RFC 4180 CSV with the QBO header, CRLF line ends, UTF-8 (the page adds the BOM). */
export function toCsv(rows: InvoiceCsvRow[]): string {
  const escape = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [INVOICE_COLUMNS.join(',')];
  for (const row of rows) lines.push(INVOICE_COLUMNS.map(col => escape(row[col] ?? '')).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** The file names for the invoice CSVs: one, or -1, -2, … when split. */
export const invoiceFileName = (index: number, count: number): string =>
  count > 1 ? `quickbooks-invoices-${index + 1}.csv` : 'quickbooks-invoices.csv';

/** What Intuit's guide says the user must do in QBO; shown after every download. */
export const QBO_CHECKLIST = [
  'In QuickBooks, turn on Custom transaction numbers (Account and Settings → Sales → Sales form content), or QuickBooks renumbers every imported invoice.',
  'Import the Customers file before the Invoices file; an invoice for an unknown customer fails.',
  'On the Import Invoices screen, pick the same date format as in Export settings.',
] as const;
