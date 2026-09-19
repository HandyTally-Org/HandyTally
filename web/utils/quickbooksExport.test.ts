import { DEFAULT_EXPORT_SETTINGS } from '../constants/exportSettings';
import {
  CUSTOMER_COLUMNS,
  INVOICE_COLUMNS,
  buildCustomersRows,
  buildInvoicesCsv,
  chunkInvoiceRows,
  formatExportDate,
  invoiceFileName,
  itemName,
  roundCents,
  toCsv,
  type ExportInvoice,
  type InvoiceCsvRow,
} from './quickbooksExport';

const settings = { ...DEFAULT_EXPORT_SETTINGS };

const clients = [
  { uid: 1, name: 'Jane Doe', company: 'Doe Property Mgmt', email: 'jane@example.com', phone: '+1 (555) 555-0100', address: '1 Main St', city: 'Boston', state: 'MA', zip: 2134, postal_code: '02134', tag: 'active' },
  { uid: 2, name: 'Bob Roe', address: '2 Elm St', city: 'Scranton', state: 'PA', zip: 18503, tag: 'lead' },
];

const invoice = (over: Partial<ExportInvoice> = {}): ExportInvoice => ({
  uid: 10,
  invoice_number: '1001',
  client_id: 1,
  job_id: 5,
  issue_date: '2026-08-12',
  due_date: '2026-09-11',
  status: 'sent',
  tax_rate: 8.25,
  fee_amount: 0,
  total: 108.25,
  invoice_items: [{ description: 'Outlet install', quantity: 2, unit_price: 50, amount: 100, type: 'service', service_id: 7 }],
  ...over,
});

describe('customers file', () => {
  it('writes the 16 columns in Intuit order with the text ZIP and the org country', () => {
    const { rows, blockers } = buildCustomersRows(clients, settings);
    expect(blockers).toEqual([]);
    expect(Object.keys(rows[0])).toEqual([...CUSTOMER_COLUMNS]);
    expect(rows[0]).toMatchObject({ Name: 'Jane Doe', Company: 'Doe Property Mgmt', ZIP: '02134', Country: 'United States', 'Customer Type': '', Fax: '', 'Opening Balance': '', Date: '' });
    expect(rows[1].ZIP).toBe('18503');
  });

  it('filters by tag and blocks on duplicate names (case-insensitive)', () => {
    expect(buildCustomersRows(clients, settings, { tags: ['lead'] }).rows.map(r => r.Name)).toEqual(['Bob Roe']);
    const dup = buildCustomersRows([...clients, { uid: 3, name: 'jane doe' }], settings);
    expect(dup.blockers).toHaveLength(1);
    expect(dup.blockers[0].code).toBe('duplicate_client_names');
    expect(dup.blockers[0].records[0]).toContain('2 clients');
  });

  it('writes an opening balance from open invoices only when asked', () => {
    const invoices = [invoice({ client_id: 1, total: 100, status: 'sent' }), invoice({ uid: 11, client_id: 1, total: 50, status: 'paid' }), invoice({ uid: 12, client_id: 1, total: 25.5, status: 'overdue' })];
    const off = buildCustomersRows(clients, settings, {}, invoices);
    expect(off.rows[0]['Opening Balance']).toBe('');
    const on = buildCustomersRows(clients, settings, { openingBalance: true, asOf: '2026-09-19' }, invoices);
    expect(on.rows[0]['Opening Balance']).toBe('125.50');
    expect(on.rows[0].Date).toBe('09/19/2026');
    expect(on.rows[1]['Opening Balance']).toBe('');
  });
});

describe('invoices file', () => {
  const jobs = [{ uid: 5, start_date: '2026-08-10T15:30:00+00:00' }];
  const catalog = { services: [{ uid: 7, name: 'Electrical: Labor' }], materials: [{ uid: 9, name: 'Panel' }] };

  it('writes the header and one row per line with header values on the first row only', () => {
    const r = buildInvoicesCsv([invoice({ invoice_items: [
      { description: 'Outlet install', quantity: 2, unit_price: 50, amount: 100, type: 'service', service_id: 7 },
      { description: 'Panel 200A', quantity: 1, unit_price: 20, amount: 20, type: 'material', material_id: 9, taxable: false },
    ], total: 128.25 })], clients, jobs, catalog, settings);
    expect(r.blockers).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      '*InvoiceNo': '1001', '*Customer': 'Jane Doe', '*InvoiceDate': '08/12/2026', '*DueDate': '09/11/2026', Terms: 'Net 30',
      'Item(Product/Service)': 'Electrical  Labor'.replace('  ', ' '), ItemDescription: 'Outlet install', ItemQuantity: '2', ItemRate: '50.00', '*ItemAmount': '100.00',
      Taxable: 'Y', TaxRate: '8.25', 'Service Date': '08/10/2026', Location: '',
    });
    expect(r.rows[1]).toMatchObject({ '*InvoiceNo': '', '*Customer': '', 'Item(Product/Service)': 'Panel', Taxable: 'N', TaxRate: '' });
    expect(r.files).toHaveLength(1);
    expect(r.files[0].split('\r\n')[0]).toBe(INVOICE_COLUMNS.join(','));
    expect(r.warnings).toEqual([]);
  });

  it('adds a Service Fee line, recomputes amounts and warns on stored differences and total mismatches', () => {
    const r = buildInvoicesCsv([invoice({
      invoice_items: [{ description: 'Widget', quantity: 3, unit_price: 1.5, amount: 4.5 }],
      fee_type: 'percent', fee_amount: 10, tax_rate: 0, total: 99,
    })], clients, jobs, catalog, settings);
    expect(r.rows.map(x => x['Item(Product/Service)'])).toEqual(['Other', 'Service Fee']);
    expect(r.rows[0]['*ItemAmount']).toBe('4.50');
    expect(r.rows[1]).toMatchObject({ ItemDescription: 'Percentage fee', ItemRate: '10.00', '*ItemAmount': '10.00', Taxable: 'N' });
    expect(r.warnings.map(w => w.code)).toEqual(['total_mismatch']);
    const stored = buildInvoicesCsv([invoice({ invoice_items: [{ description: 'Widget', quantity: 2, unit_price: 10, amount: 25 }], tax_rate: 0, total: 20 })], clients, jobs, catalog, settings);
    expect(stored.warnings.map(w => w.code)).toEqual(['recomputed_amounts']);
    expect(stored.rows[0]['*ItemAmount']).toBe('20.00');
  });

  it('never includes estimates, work orders or cancelled documents, and honours the date range', () => {
    const r = buildInvoicesCsv([
      invoice({ uid: 1, invoice_number: '1', status: 'estimate' }),
      invoice({ uid: 2, invoice_number: '2', status: 'work_order' }),
      invoice({ uid: 3, invoice_number: '3', status: 'cancelled' }),
      invoice({ uid: 4, invoice_number: '4', status: 'paid', issue_date: '2026-01-05', due_date: '2026-01-05' }),
      invoice({ uid: 5, invoice_number: '5', status: 'sent', issue_date: '2026-06-01', due_date: '2026-06-08' }),
    ], clients, jobs, catalog, settings, { from: '2026-05-01' });
    expect(r.rows.map(x => x['*InvoiceNo'])).toEqual(['5']);
    expect(r.rows[0].Terms).toBe('');
    expect(r.summary.excluded).toBe(3);
    const all = buildInvoicesCsv([invoice({ uid: 4, invoice_number: '4', status: 'paid' })], clients, jobs, catalog, settings);
    expect(all.warnings[0]).toMatchObject({ code: 'paid_state_not_exported', records: ['#4 (paid)'] });
  });

  it('blocks on duplicate or missing invoice numbers and missing clients, producing no file', () => {
    const r = buildInvoicesCsv([
      invoice({ uid: 1, invoice_number: '1001' }),
      invoice({ uid: 2, invoice_number: '1001' }),
      invoice({ uid: 3, invoice_number: '', client_id: 99 }),
    ], clients, jobs, catalog, settings);
    expect(r.blockers.map(b => b.code).sort()).toEqual(['duplicate_invoice_numbers', 'missing_client', 'missing_invoice_numbers']);
    expect(r.files).toEqual([]);
  });

  it('collapses memo newlines, escapes CSV specials and uses the chosen date format', () => {
    const r = buildInvoicesCsv([invoice({ notes: 'Line one\r\n  line "two", done', tax_rate: 0, total: 100 })], clients, jobs, catalog, { ...settings, dateFormat: 'DD/MM/YYYY' });
    expect(r.rows[0].Memo).toBe('Line one line "two", done');
    expect(r.rows[0]['*InvoiceDate']).toBe('12/08/2026');
    expect(r.files[0]).toContain('"Line one line ""two"", done"');
  });

  it('uses the stored terms when present and derives them otherwise', () => {
    const stored = buildInvoicesCsv([invoice({ terms: 'net_15', tax_rate: 0, total: 100 })], clients, jobs, catalog, settings);
    expect(stored.rows[0].Terms).toBe('Net 15');
  });
});

describe('splitting and helpers', () => {
  const line = (n: string): InvoiceCsvRow => ({ ...Object.fromEntries(INVOICE_COLUMNS.map(c => [c, ''])), '*InvoiceNo': n } as InvoiceCsvRow);

  it('splits at the row limit without splitting an invoice', () => {
    const perInvoice = [[line('1'), line(''), line('')], [line('2'), line('')], [line('3'), line(''), line('')]];
    const chunks = chunkInvoiceRows(perInvoice, 5);
    expect(chunks.map(c => c.length)).toEqual([5, 3]);
    expect(chunks[1][0]['*InvoiceNo']).toBe('3');
    expect(chunkInvoiceRows(perInvoice, 1000)).toHaveLength(1);
    expect(chunkInvoiceRows([], 1000)).toEqual([]);
  });

  it('names files and formats dates, names and cents', () => {
    expect(invoiceFileName(0, 1)).toBe('quickbooks-invoices.csv');
    expect(invoiceFileName(1, 3)).toBe('quickbooks-invoices-2.csv');
    expect(formatExportDate('2026-09-01', 'MM/DD/YYYY')).toBe('09/01/2026');
    expect(formatExportDate('2026-09-01T10:00:00Z', 'DD/MM/YYYY')).toBe('01/09/2026');
    expect(formatExportDate('nope', 'MM/DD/YYYY')).toBe('');
    expect(itemName('Parent:Child  name')).toBe('Parent Child name');
    expect(itemName('x'.repeat(120))).toHaveLength(100);
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(2.675)).toBe(2.68);
  });

  it('writes CRLF CSV with the header first', () => {
    const csv = toCsv([line('7')]);
    expect(csv.startsWith('*InvoiceNo,*Customer,')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
  });
});
