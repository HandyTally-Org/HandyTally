export type CalendarView = 'month' | 'week' | 'day';

export interface CalendarEvent {
  id: string;
  title: string;
  /** Inclusive start. */
  start: Date;
  /** Exclusive end, like RFC 5545. An event ending at midnight does not cover that day. */
  end: Date;
  allDay?: boolean;
  /** Second line on the chip and in the detail dialog, e.g. the client name. */
  subtitle?: string;
  description?: string;
  status?: string;
  /** Chip background. */
  color: string;
  /** Chip text; defaults to a dark neutral. */
  textColor?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}
