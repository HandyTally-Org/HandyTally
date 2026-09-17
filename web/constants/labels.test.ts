import { BUILT_IN_LABELS, labelColor, labelText, mergeLabels } from './labels';

describe('mergeLabels', () => {
  it('returns the built-ins when the organisation has no overrides', () => {
    expect(mergeLabels('job_status', null)).toEqual([...BUILT_IN_LABELS.job_status]);
    expect(mergeLabels('client_tag', {})).toEqual([...BUILT_IN_LABELS.client_tag]);
  });

  it('appends a value the organisation added, so a picker offers it', () => {
    const list = mergeLabels('job_status', {
      job_status: [{ value: 'on_hold', label: 'On hold', color: '#EEE', textColor: '#333' }],
    });
    expect(list.map(def => def.value)).toEqual(['pending', 'in_progress', 'completed', 'cancelled', 'on_hold']);
    expect(labelText(list, 'on_hold')).toBe('On hold');
    expect(labelColor(list, 'on_hold')).toBe('#EEE');
    expect(list.find(def => def.value === 'on_hold')?.builtIn).toBeUndefined();
  });

  it('renames and recolours a built-in without moving or removing it', () => {
    const list = mergeLabels('invoice_status', {
      invoice_status: [{ value: 'work_order', label: 'Approved', color: '#123456' }],
    });
    expect(list.map(def => def.value)).toEqual(BUILT_IN_LABELS.invoice_status.map(def => def.value));
    const workOrder = list.find(def => def.value === 'work_order');
    expect(workOrder).toMatchObject({ label: 'Approved', color: '#123456', builtIn: true });
    // A field the override leaves out keeps the built-in value.
    expect(workOrder?.textColor).toBe(BUILT_IN_LABELS.invoice_status.find(d => d.value === 'work_order')?.textColor);
  });

  it('gives an added value with no label a readable name and a fallback colour', () => {
    const list = mergeLabels('client_tag', { client_tag: [{ value: 'past_due' }] });
    expect(labelText(list, 'past_due')).toBe('Past due');
    expect(labelColor(list, 'past_due')).toBe('#F5F5F5');
  });

  it('never loses a stored value: an unknown one still gets a name and a colour', () => {
    const list = mergeLabels('job_status');
    expect(labelText(list, 'archived')).toBe('Archived');
    expect(labelColor(list, 'archived')).toBe('#F5F5F5');
    expect(labelText(list, null)).toBe('');
  });
});
