import { formatDate } from './formatting';
import { invoiceDocumentLabel } from '../constants/invoiceStatus';

// Renders an invoice, estimate or work order as HTML.
// Extracted from components/InvoiceDetails.tsx so the same markup is used by
// Print, by the invoice send path (HT-4) and by the estimate approval email
// (HT-10) without the three drifting apart.
//
// renderInvoiceDocument returns the stylesheet and the markup separately so
// the approval email can embed the document inside its own page. Every
// selector is scoped under .ht-doc for that reason. generateInvoiceHTML wraps
// the two in a complete page for Print and for the plain invoice email.

export type InvoiceDocumentParts = { css: string; markup: string };

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = escapeHtml;

// HT-88: one <div> per non-empty value, a multi-line address becoming one
// line per row. Nothing is printed for a missing value: the document used to
// fill the gaps with "Your Company" / "Client Address" and the like, which
// then went out to clients as if it were real.
const textLines = (values: unknown[]) =>
  values
    .flatMap(value => String(value ?? '').split('\n'))
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<div>${escapeHtml(line)}</div>`)
    .join('');

/** HT-78: a Company > Documents row marked to show on invoices (name + details; HT-87 attaches fileName's file to the sent email). */
export type InvoiceDocumentSummary = { label: string; value: string; fileName: string | null };

export const generateInvoiceHTML = (invoice: any, items: any[], companyInfo: any, companyDocuments: InvoiceDocumentSummary[] = []) => {
  const { css, markup } = renderInvoiceDocument(invoice, items, companyInfo, companyDocuments);
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { margin: 0; padding: 0; }
          ${css}
        </style>
      </head>
      <body>
        ${markup}
      </body>
    </html>
  `;
};

export const renderInvoiceDocument = (
  invoice: any,
  items: any[],
  companyInfo: any,
  companyDocuments: InvoiceDocumentSummary[] = [],
): InvoiceDocumentParts => {
  // Determine the job name to display
  const jobName = invoice.job?.name ||
                 invoice.job?.title ||
                 invoice.job?.job_name ||
                 invoice.job?.description ||
                 invoice.job_name ||
                 (invoice.job_id ? `Job #${invoice.job_id}` : 'N/A');

  // An estimate says ESTIMATE, a work order WORK ORDER; only a document in a
  // payment state is an INVOICE.
  const title = invoiceDocumentLabel(invoice.status).toUpperCase();
  const statusText = String(invoice.status || '').replace(/_/g, ' ').toUpperCase();

  const css = `
          .ht-doc {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            padding: 2px;
            margin: 0 auto; /* Center the content */
            max-width: 800px; /* Set a maximum width */
            color: #333;
          }
          .ht-doc .header-container {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0;
            margin-bottom: 5px;
          }
          .ht-doc .header-container td {
            vertical-align: top;
            padding: 5px;
            border-bottom: none;
          }
          .ht-doc .invoice-title-section {
            width: 100%;
          }
          .ht-doc .company-column {
            text-align: right;
          }
          .ht-doc .logo {
            text-align: right;
            margin-left: 10px;
          }
          .ht-doc .logo img {
            max-width: 150px;
            max-height: 80px;
          }
          .ht-doc .company-info {
            text-align: right;
            margin-top: 0;
          }
          .ht-doc .invoice-details {
            margin: 5px 0;
            padding: 0 5px;
          }
          .ht-doc .client-info {
            margin-top: 10px;
          }
          .ht-doc h1 {
            margin: 0;
            padding: 0;
            font-size: 24px;
          }
          .ht-doc h3 {
            margin: 5px 0;
            padding: 0;
          }
          .ht-doc .status {
            display: inline-block;
            padding: 2px 5px;
            border-radius: 4px;
            font-size: 12px;
            margin-top: 5px;
          }
          .ht-doc table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .ht-doc th, .ht-doc td {
            border-bottom: 1px solid #ddd;
            text-align: left;
            padding: 5px;
          }
          .ht-doc th {
            background-color: #f2f2f2;
          }
          .ht-doc .totals {
            width: 300px;
            margin-left: auto;
            margin-top: 10px;
          }
          .ht-doc .total-row {
            display: flex;
            justify-content: space-between;
            padding: 2px 0;
          }
          .ht-doc .grand-total {
            font-weight: bold;
            border-top: 1px solid #000;
            padding-top: 5px;
          }
          .ht-doc .notes {
            margin-top: 10px;
            padding: 5px;
            background-color: #f9f9f9;
          }
          .ht-doc .documents {
            margin-top: 10px;
            padding: 5px;
          }
          .ht-doc .documents h3 {
            margin: 0 0 5px 0;
          }
          .ht-doc .documents table {
            margin-top: 0;
          }
          .ht-doc .documents td {
            border-bottom: 1px solid #eee;
          }
  `;

  const markup = `
        <div class="ht-doc">
        <table class="header-container" role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td class="invoice-title-section">
              <h1>${title} #${invoice.invoice_number}</h1>
              <div class="status status-${invoice.status}">${statusText}</div>

              <div class="invoice-details">
                <div><strong>Date:</strong> ${formatDate(invoice.issue_date)}</div>
                <div><strong>Due Date:</strong> ${formatDate(invoice.due_date)}</div>
                <div><strong>Job:</strong> ${jobName}</div>
              </div>

              <div class="client-info">
                <h3>Bill To:</h3>
                ${textLines([invoice.client?.name, invoice.client?.address, invoice.client?.email])}
              </div>
            </td>

            <td class="company-column">
              ${companyInfo?.logo_url ? `
              <div class="logo">
                <img src="${escapeAttribute(companyInfo.logo_url)}" alt="${escapeAttribute(companyInfo.business_name || 'Company')} logo">
              </div>` : ''}
              <div class="company-info">
                ${companyInfo?.business_name ? `<div><strong>${escapeHtml(companyInfo.business_name)}</strong></div>` : ''}
                ${textLines([companyInfo?.address, companyInfo?.email, companyInfo?.phone])}
              </div>
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 50%">Description</th>
              <th style="width: 15%; text-align: center">Quantity</th>
              <th style="width: 15%; text-align: right">Unit Price</th>
              <th style="width: 20%; text-align: right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td style="text-align: center">${item.quantity}</td>
                <td style="text-align: right">$${parseFloat(item.unit_price).toFixed(2)}</td>
                <td style="text-align: right">$${parseFloat(item.amount).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <div>Subtotal:</div>
            <div>$${invoice.subtotal.toFixed(2)}</div>
          </div>
          <div class="total-row">
            <div>Tax (${invoice.tax_rate}%):</div>
            <div>$${invoice.tax_amount.toFixed(2)}</div>
          </div>
          <div class="total-row grand-total">
            <div>Total:</div>
            <div>$${invoice.total.toFixed(2)}</div>
          </div>
        </div>

        ${companyDocuments.length > 0 ? `
          <div class="documents">
            <h3>Licences &amp; Insurance</h3>
            <table>
              <tbody>
                ${companyDocuments.map(companyDoc => `
                  <tr>
                    <td><strong>${companyDoc.label}</strong></td>
                    <td>${escapeHtml(companyDoc.value)}${companyDoc.fileName ? ` <em>(attached: ${escapeHtml(companyDoc.fileName)})</em>` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        ${invoice.notes ? `
          <div class="notes">
            <div><strong>Notes:</strong></div>
            <div>${invoice.notes}</div>
          </div>
        ` : ''}
        </div>
  `;

  return { css, markup };
};
