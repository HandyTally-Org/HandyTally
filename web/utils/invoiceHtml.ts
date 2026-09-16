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

export const generateInvoiceHTML = (invoice: any, items: any[], companyInfo: any) => {
  const { css, markup } = renderInvoiceDocument(invoice, items, companyInfo);
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

export const renderInvoiceDocument = (invoice: any, items: any[], companyInfo: any): InvoiceDocumentParts => {
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
                <div>${invoice.client?.name || 'Client Name'}</div>
                <div>${invoice.client?.address || 'Client Address'}</div>
                <div>${invoice.client?.email || 'client@example.com'}</div>
              </div>
            </td>

            <td class="company-column">
              <div class="logo">
                ${companyInfo?.logo_url ?
                  `<img src="${companyInfo.logo_url}" alt="${companyInfo.business_name || 'Company'} Logo">` :
                  `<div class="logo-text">${companyInfo?.business_name || 'COMPANY LOGO'}</div>`
                }
              </div>
              <div class="company-info">
                <div><strong>${companyInfo?.business_name || 'Your Company'}</strong></div>
                <div>${companyInfo?.address || 'Company Address'}</div>
                <div>${companyInfo?.email || 'company@example.com'}</div>
                <div>${companyInfo?.phone || '(123) 456-7890'}</div>
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
