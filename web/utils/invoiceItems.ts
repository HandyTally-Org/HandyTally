// HT-25: one place that turns a line item from the invoice form into the row
// written to invoice_items. The five save paths in app/(app)/invoices.tsx
// used to build this literal by hand, and three of them left out type,
// service_id and material_id ("if they're causing issues", which they no
// longer are), so a linked catalogue item lost its link on save and the
// QuickBooks export could not name the item. Every path now writes the same
// columns.

/** A custom line: what the form stores for a line that is not a catalogue item. */
export const CUSTOM_ITEM_TYPE = 'other';

export type InvoiceItemInput = {
  description?: string | null;
  notes?: string | null;
  photos?: unknown[] | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  amount?: number | string | null;
  type?: string | null;
  service_id?: number | string | null;
  material_id?: number | string | null;
  taxable?: boolean | null;
};

export type InvoiceItemRow = {
  invoice_id: number | string;
  description: string;
  notes: string | null;
  photos: unknown[];
  quantity: number;
  unit_price: number;
  amount: number;
  type: 'service' | 'material' | 'other';
  service_id: number | null;
  material_id: number | null;
  taxable: boolean;
};

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const id = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/** 'service' / 'material' as stored; anything else ('other', legacy 'custom', blank) is a custom line. */
export const normalizeItemType = (type: unknown): InvoiceItemRow['type'] =>
  type === 'service' || type === 'material' ? type : CUSTOM_ITEM_TYPE;

export function invoiceItemRow(item: InvoiceItemInput, invoiceId: number | string): InvoiceItemRow {
  const type = normalizeItemType(item.type);
  return {
    invoice_id: invoiceId,
    description: item.description ?? '',
    notes: item.notes || null,
    photos: Array.isArray(item.photos) ? item.photos : [],
    quantity: num(item.quantity),
    unit_price: num(item.unit_price),
    amount: num(item.amount),
    type,
    // A link only makes sense for its own type; a stale id on a custom line is dropped.
    service_id: type === 'service' ? id(item.service_id) : null,
    material_id: type === 'material' ? id(item.material_id) : null,
    // Lines from before HT-25 have no flag and count as taxable.
    taxable: item.taxable !== false,
  };
}
