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

import { BUILT_IN_LABELS, findLabel } from './labels';

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

// HT-49: the values, names and colours live in constants/labels.ts with the
// job statuses and client tags. Screens that render a picker or a filter use
// useLabels('invoice_status') so organisation-added values appear; these
// built-in-only helpers remain for code outside React (invoiceHtml.ts, email
// subjects) and for the behaviour gates below.
const BUILT_IN = BUILT_IN_LABELS.invoice_status;

export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = BUILT_IN.map(def => ({
  value: def.value as InvoiceStatus,
  label: def.label,
}));

export function invoiceStatusLabel(status: string | null | undefined): string {
  return findLabel(BUILT_IN, status)?.label ?? (status || '');
}

// Text colour for a status shown on its own (list rows, dashboard).
export function invoiceStatusColor(status: string | null | undefined): string {
  return findLabel(BUILT_IN, status)?.textColor ?? '#000000';
}

// Behaviour, not display: an invoice counts as open on the dashboard until
// it is paid or cancelled. Built-in values only, on purpose — an
// organisation-added status has no payment meaning the app can act on.
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ['estimate', 'work_order', 'sent', 'partial_paid', 'overdue'];

// What the document calls itself in its header and in email subjects.
export function invoiceDocumentLabel(status: string | null | undefined): 'Estimate' | 'Work Order' | 'Invoice' {
  if (status === 'estimate') return 'Estimate';
  if (status === 'work_order') return 'Work Order';
  return 'Invoice';
}
