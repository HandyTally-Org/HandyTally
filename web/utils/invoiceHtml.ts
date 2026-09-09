import { formatDate } from './formatting';

// Generates the printable HTML for an invoice.
// Extracted from components/InvoiceDetails.tsx so the same markup can be
// reused by the invoice send path (HT-4) without the two drifting apart.
export const generateInvoiceHTML = (invoice, items, companyInfo) => {
  // Log the invoice object to debug
  console.log('Invoice object for HTML generation:', invoice);
  
  // Determine the job name to display
  const jobName = invoice.job?.name || 
                 invoice.job?.title ||
                 invoice.job?.job_name ||
                 invoice.job?.description ||
                 invoice.job_name || 
                 (invoice.job_id ? `Job #${invoice.job_id}` : 'N/A');
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            padding: 2px;
            margin: 0 auto; /* Center the content */
            max-width: 800px; /* Set a maximum width */
            color: #333;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 5px;
            padding: 5px;
          }
          .invoice-title-section {
            flex: 1;
          }
          .logo {
            text-align: right;
            margin-left: 10px;
          }
          .logo img {
            max-width: 150px;
            max-height: 80px;
          }
          .company-info {
            text-align: right;
            margin-top: 0;
          }
          .invoice-details {
            margin: 5px 0;
            padding: 0 5px;
          }
          .client-info {
            margin-top: 10px;
          }
          h1 {
            margin: 0;
            padding: 0;
            font-size: 24px;
          }
          h3 {
            margin: 5px 0;
            padding: 0;
          }
          .status {
            display: inline-block;
            padding: 2px 5px;
            border-radius: 4px;
            font-size: 12px;
            margin-top: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            border-bottom: 1px solid #ddd;
            text-align: left;
            padding: 5px;
          }
          th {
            background-color: #f2f2f2;
          }
          .totals {
            width: 300px;
            margin-left: auto;
            margin-top: 10px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 2px 0;
          }
          .grand-total {
            font-weight: bold;
            border-top: 1px solid #000;
            padding-top: 5px;
          }
          .notes {
            margin-top: 10px;
            padding: 5px;
            background-color: #f9f9f9;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="invoice-title-section">
            <h1>INVOICE #${invoice.invoice_number}</h1>
            <div class="status status-${invoice.status}">${invoice.status.toUpperCase()}</div>
            
            <div class="invoice-details">
              <div><strong>Invoice Date:</strong> ${formatDate(invoice.issue_date)}</div>
              <div><strong>Due Date:</strong> ${formatDate(invoice.due_date)}</div>
              <div><strong>Job:</strong> ${jobName}</div>
            </div>
            
            <div class="client-info">
              <h3>Bill To:</h3>
              <div>${invoice.client?.name || 'Client Name'}</div>
              <div>${invoice.client?.address || 'Client Address'}</div>
              <div>${invoice.client?.email || 'client@example.com'}</div>
            </div>
          </div>
          
          <div>
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
          </div>
        </div>
        
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
      </body>
    </html>
  `;
};
