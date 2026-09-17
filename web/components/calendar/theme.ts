import { findLabel, labelText, type LabelDef } from '../../constants/labels';

// Visual tokens for the calendar, kept in one place so the month grid, the
// time grid and the dialogs stay consistent.

export const calendarTheme = {
  accent: '#2563EB',
  accentText: '#FFFFFF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  background: '#FFFFFF',
  mutedBackground: '#F9FAFB',
  text: '#111827',
  mutedText: '#6B7280',
  faintText: '#9CA3AF',
  todayColumn: '#EFF6FF',
  nowLine: '#EF4444',
  buttonBackground: '#FFFFFF',
  buttonBorder: '#D1D5DB',
};

// Row budget in month view: the day number line, a fixed number of event
// lanes, and one line reserved for "+N more".
export const MONTH_HEADER_HEIGHT = 26;
export const MONTH_LANE_HEIGHT = 22;
export const MONTH_MORE_HEIGHT = 18;

export const TIME_GUTTER_WIDTH = 56;
export const HOUR_HEIGHT = 48;
export const ALL_DAY_LANE_HEIGHT = 22;

/**
 * Chip colours by job status: the calendar's own pale palette for the
 * built-in values, so the grid keeps its look, and the label module's colour
 * for any value an organisation added or recoloured (HT-49) — an unknown
 * status is never rendered in the "no status" colour.
 */
export const statusColors: Record<string, { color: string; textColor: string }> = {
  pending: { color: '#FEF3C7', textColor: '#92400E' },
  in_progress: { color: '#DBEAFE', textColor: '#1E3A8A' },
  completed: { color: '#DCFCE7', textColor: '#14532D' },
  cancelled: { color: '#FEE2E2', textColor: '#991B1B' },
};

export const defaultEventColors = { color: '#EDE9FE', textColor: '#4C1D95' };

export function colorsForStatus(status?: string | null, labels?: readonly LabelDef[]) {
  if (!status) return defaultEventColors;
  const value = status.toLowerCase();
  const def = labels && findLabel(labels, value);
  if (def && (!def.builtIn || !statusColors[value])) return { color: def.color, textColor: def.textColor };
  return statusColors[value] ?? defaultEventColors;
}

export function statusLabel(status?: string | null, labels?: readonly LabelDef[]): string {
  if (!status) return 'Unknown';
  if (labels) return labelText(labels, status);
  return status.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());
}
