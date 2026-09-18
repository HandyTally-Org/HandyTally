import { renderInvoiceDocument } from './invoiceHtml';

const invoice = {
  invoice_number: 1001,
  status: 'estimate',
  issue_date: '2026-09-18',
  due_date: '2026-10-18',
  subtotal: 100,
  tax_rate: 0,
  tax_amount: 0,
  total: 100,
  client: { name: 'Angela White', address: '1234 Big St', email: 'angela@example.com' },
};

describe('renderInvoiceDocument company header (HT-88)', () => {
  it('prints the organisation\'s own company info and logo', () => {
    const { markup } = renderInvoiceDocument(invoice, [], {
      business_name: 'WG Electric',
      address: '12 Main St\nScranton, PA 18503',
      email: 'office@wgelectric.com',
      phone: '(555) 555-0100',
      logo_url: 'data:image/png;base64,AAAA',
    });
    expect(markup).toContain('<strong>WG Electric</strong>');
    expect(markup).toContain('<div>12 Main St</div>');
    expect(markup).toContain('<div>Scranton, PA 18503</div>');
    expect(markup).toContain('<div>office@wgelectric.com</div>');
    expect(markup).toContain('<div>(555) 555-0100</div>');
    expect(markup).toContain('<img src="data:image/png;base64,AAAA" alt="WG Electric logo">');
  });

  it('prints nothing, not placeholder text, when the company info is missing', () => {
    const { markup } = renderInvoiceDocument(invoice, [], null);
    for (const placeholder of ['Your Company', 'Company Address', 'company@example.com', 'COMPANY LOGO', '(123) 456-7890']) {
      expect(markup).not.toContain(placeholder);
    }
    expect(markup).not.toContain('<img');
    expect(markup).toContain('Angela White');
  });

  it('leaves out client placeholders too', () => {
    const { markup } = renderInvoiceDocument({ ...invoice, client: null }, [], null);
    for (const placeholder of ['Client Name', 'Client Address', 'client@example.com']) {
      expect(markup).not.toContain(placeholder);
    }
  });

  it('escapes company text so a stray angle bracket cannot break the email', () => {
    const { markup } = renderInvoiceDocument(invoice, [], { business_name: 'A <b>& B' });
    expect(markup).toContain('<strong>A &lt;b&gt;&amp; B</strong>');
  });
});
