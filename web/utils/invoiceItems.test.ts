import { invoiceItemRow, normalizeItemType } from './invoiceItems';

describe('invoiceItemRow (HT-25)', () => {
  it('writes every column, including the type, links and taxable flag', () => {
    expect(
      invoiceItemRow(
        { description: 'Panel', quantity: '2', unit_price: '10.5', amount: 21, type: 'material', material_id: '7', taxable: false },
        42,
      ),
    ).toEqual({
      invoice_id: 42,
      description: 'Panel',
      notes: null,
      photos: [],
      quantity: 2,
      unit_price: 10.5,
      amount: 21,
      type: 'material',
      service_id: null,
      material_id: 7,
      taxable: false,
    });
  });

  it('treats a missing taxable flag as taxable and blanks as zero', () => {
    const row = invoiceItemRow({ description: 'Labor', quantity: '', unit_price: null, amount: undefined }, 1);
    expect(row.taxable).toBe(true);
    expect(row.quantity).toBe(0);
    expect(row.unit_price).toBe(0);
    expect(row.amount).toBe(0);
    expect(row.type).toBe('other');
  });

  it("normalises the legacy 'custom' type and drops a link that does not match the type", () => {
    expect(normalizeItemType('custom')).toBe('other');
    expect(normalizeItemType(undefined)).toBe('other');
    const row = invoiceItemRow({ type: 'custom', service_id: 3, material_id: 4 }, 1);
    expect(row.type).toBe('other');
    expect(row.service_id).toBeNull();
    expect(row.material_id).toBeNull();
    expect(invoiceItemRow({ type: 'service', service_id: 3, material_id: 4 }, 1)).toMatchObject({ service_id: 3, material_id: null });
  });
});
