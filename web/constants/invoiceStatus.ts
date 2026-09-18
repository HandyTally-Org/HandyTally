// HT-10: the one place that says which statuses an invoice can have, what
// they are called, and which one a new document starts in. The list-row
// select, the form select and the details-pane pills used to each carry their
// own copy in a different order (and the list still offered 'draft', which
// the page then rewrote to 'estimate' on every load).
//
// The column is a plain text column that carries two unrelated facts: the
// document type (estimate, work_order) and the payment state (sent,
// partial_paid, paid, overdue). See the header of
// supabase/migrations/20260909120000_invoice_sent_at.sql for why sending does
// not touch it. Approval (estimate -> work_order) does, because it changes
// the document type.

export type InvoiceStatus =
  | 'estimate'
  | 'work_order'
  | 'sent'
  | 'partial_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled';

// Every new invoice starts as an estimate; "Send for Approval" is how it
// becomes a work order.
export const NEW_INVOICE_STATUS: InvoiceStatus = 'estimate';

export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'estimate', label: 'Estimate' },
  { value: 'work_order', label: 'Work Order' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial_paid', label: 'Partial Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function invoiceStatusLabel(status: string | null | undefined): string {
  return INVOICE_STATUS_OPTIONS.find(option => option.value === status)?.label ?? (status || '');
}

// Text colour for a status shown on its own (list rows, dashboard).
export function invoiceStatusColor(status: string | null | undefined): string {
  switch (status) {
    case 'estimate':
      return '#666666';
    case 'work_order':
      return '#9c27b0';
    case 'sent':
      return '#0066cc';
    case 'partial_paid':
      return '#ff9800';
    case 'paid':
      return '#008800';
    case 'overdue':
      return '#cc0000';
    case 'cancelled':
      return '#888888';
    default:
      return '#000000';
  }
}

// Light tint background for the status pill (list rows, dashboard), paired
// with invoiceStatusColor for the text.
export function invoiceStatusBackground(status: string | null | undefined): string {
  switch (status) {
    case 'estimate':
      return '#eeeeee';
    case 'work_order':
      return '#f3e5f5';
    case 'sent':
      return '#e3f2fd';
    case 'partial_paid':
      return '#fff3e0';
    case 'paid':
      return '#e8f5e9';
    case 'overdue':
      return '#fdecea';
    case 'cancelled':
      return '#eeeeee';
    default:
      return '#eeeeee';
  }
}

// What the document calls itself in its header and in email subjects.
export function invoiceDocumentLabel(status: string | null | undefined): 'Estimate' | 'Work Order' | 'Invoice' {
  if (status === 'estimate') return 'Estimate';
  if (status === 'work_order') return 'Work Order';
  return 'Invoice';
}
