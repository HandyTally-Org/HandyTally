// HT-49: the one place that defines every job status, invoice status and
// client tag: its stored value, what it is called and what colour it gets.
// Screens render pickers, chips, filters and calendar colours from
// `useLabels(section)` (hooks/useLabels.ts), never from a literal list, so
// that a value an admin adds in Settings (HT-51) shows up everywhere at once.
//
// The `value` strings are exactly what is stored: `jobs.status`,
// `invoices.status` and `clients.tag` are plain text columns with no
// constraint, so a change here would silently orphan rows. Do not rename.

export type LabelSection = 'job_status' | 'invoice_status' | 'client_tag';

export type LabelDef = {
  value: string;
  label: string;
  /** Fill colour for chips, filter buttons and chart segments. */
  color: string;
  /** Text colour when the status is shown as plain text (list rows). */
  textColor: string;
  /** Present on the built-in entries; organisation additions leave it unset. */
  builtIn?: true;
};

/**
 * What an organisation stores against a section in
 * organization_settings.labels (HT-50 / HT-51): renamed or recoloured
 * built-ins carry only the fields that changed; added values carry all of
 * them. Order is the display order.
 */
export type LabelOverride = { value: string; label?: string; color?: string; textColor?: string };
export type OrganizationLabels = Partial<Record<LabelSection, LabelOverride[]>>;

const builtIn = (value: string, label: string, color: string, textColor: string): LabelDef => ({
  value,
  label,
  color,
  textColor,
  builtIn: true,
});

export const BUILT_IN_LABELS: Record<LabelSection, readonly LabelDef[]> = {
  job_status: [
    builtIn('pending', 'Pending', '#FFF9C4', '#92400E'),
    builtIn('in_progress', 'In Progress', '#BBDEFB', '#1E3A8A'),
    builtIn('completed', 'Completed', '#C8E6C9', '#14532D'),
    builtIn('cancelled', 'Cancelled', '#FFCDD2', '#991B1B'),
  ],
  // The document type (estimate, work_order) and the payment state share one
  // column; see constants/invoiceStatus.ts for the behaviour built on them.
  invoice_status: [
    builtIn('estimate', 'Estimate', '#9E9E9E', '#666666'),
    builtIn('work_order', 'Work Order', '#9C27B0', '#9c27b0'),
    builtIn('sent', 'Sent', '#2196F3', '#0066cc'),
    builtIn('partial_paid', 'Partial Paid', '#FF9800', '#ff9800'),
    builtIn('paid', 'Paid', '#4CAF50', '#008800'),
    builtIn('overdue', 'Overdue', '#F44336', '#cc0000'),
    builtIn('cancelled', 'Cancelled', '#607D8B', '#888888'),
  ],
  client_tag: [
    builtIn('existing', 'Existing', '#2196F3', '#0d47a1'),
    builtIn('pending', 'Pending', '#FFC107', '#7a4f00'),
    builtIn('prospect', 'Prospect', '#4CAF50', '#1b5e20'),
  ],
};

/** Colour used for a value no definition knows about (old data, a removed addition). */
export const UNKNOWN_LABEL_COLOR = '#F5F5F5';
export const UNKNOWN_LABEL_TEXT_COLOR = '#000000';

/**
 * Built-ins merged with an organisation's overrides: a built-in keeps its
 * value and picks up any renamed label or colour; a value the organisation
 * added is appended in the order stored. Built-ins can never be removed
 * (HT-51), so every stored row still has a definition.
 */
export function mergeLabels(section: LabelSection, overrides?: OrganizationLabels | null): LabelDef[] {
  const base = BUILT_IN_LABELS[section];
  const custom = overrides?.[section];
  if (!custom || custom.length === 0) return [...base];

  const byValue = new Map(custom.map(o => [o.value, o]));
  const merged: LabelDef[] = base.map(def => {
    const o = byValue.get(def.value);
    return o ? { ...def, label: o.label ?? def.label, color: o.color ?? def.color, textColor: o.textColor ?? def.textColor } : def;
  });
  for (const o of custom) {
    if (base.some(def => def.value === o.value)) continue;
    merged.push({
      value: o.value,
      label: o.label ?? humanise(o.value),
      color: o.color ?? UNKNOWN_LABEL_COLOR,
      textColor: o.textColor ?? UNKNOWN_LABEL_TEXT_COLOR,
    });
  }
  return merged;
}

/** "on_hold" -> "On hold", for a value with no label. */
export function humanise(value: string): string {
  const words = value.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

export function findLabel(list: readonly LabelDef[], value: string | null | undefined): LabelDef | undefined {
  if (!value) return undefined;
  return list.find(def => def.value === value);
}

/** The display name for a stored value, falling back to a readable form of the value itself. */
export function labelText(list: readonly LabelDef[], value: string | null | undefined): string {
  return findLabel(list, value)?.label ?? (value ? humanise(value) : '');
}

export function labelColor(list: readonly LabelDef[], value: string | null | undefined): string {
  return findLabel(list, value)?.color ?? UNKNOWN_LABEL_COLOR;
}

export function labelTextColor(list: readonly LabelDef[], value: string | null | undefined): string {
  return findLabel(list, value)?.textColor ?? UNKNOWN_LABEL_TEXT_COLOR;
}
