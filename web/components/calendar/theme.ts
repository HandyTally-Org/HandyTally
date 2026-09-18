import { findLabel, labelText, type LabelDef } from '../../constants/labels';
import { themed } from '../../constants/Colors';

// Visual tokens for the calendar, kept in one place so the month grid, the
// time grid and the dialogs stay consistent.
//
// HT-68: the surfaces, borders and text are CSS-variable references that
// follow the organisation's theme (constants/Colors.ts) and are for styles
// only. The accent, the "now" line and the today tint are fixed: the tint is
// a translucent accent so it reads on both grounds. A Paper colour prop
// (outlineColor, textColor, ...) must take hex from useAppTheme().colors.
export const calendarTheme = {
  accent: '#2563EB',
  accentText: '#FFFFFF',
  border: themed.line,
  borderStrong: themed.line,
  background: themed.panel,
  mutedBackground: themed.soft,
  text: themed.text,
  mutedText: themed.muted,
  faintText: themed.faint,
  todayColumn: 'rgba(37, 99, 235, 0.10)',
  nowLine: '#EF4444',
  buttonBackground: themed.panel,
  buttonBorder: themed.line,
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
