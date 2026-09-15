import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfDay,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { CalendarEvent, CalendarView, DateRange } from './types';

export const WEEK_STARTS_ON = 0; // Sunday, matching the old calendar

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Six rows of seven days covering the month that contains `anchor`. */
export function getMonthGrid(anchor: Date): Date[][] {
  const first = startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON });
  const rows: Date[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: Date[] = [];
    for (let c = 0; c < 7; c++) {
      row.push(addDays(first, r * 7 + c));
    }
    rows.push(row);
  }
  return rows;
}

export function getWeekDays(anchor: Date): Date[] {
  const first = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** The dates a view shows for `anchor`, as an inclusive-start / exclusive-end range. */
export function getVisibleRange(view: CalendarView, anchor: Date): DateRange {
  if (view === 'month') {
    const grid = getMonthGrid(anchor);
    return { start: grid[0][0], end: addDays(grid[5][6], 1) };
  }
  if (view === 'week') {
    const days = getWeekDays(anchor);
    return { start: days[0], end: addDays(days[6], 1) };
  }
  return { start: startOfDay(anchor), end: addDays(startOfDay(anchor), 1) };
}

export function stepAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === 'month') return addMonths(anchor, direction);
  if (view === 'week') return addWeeks(anchor, direction);
  return addDays(anchor, direction);
}

/** Days the event touches, clipped to `[rangeStart, rangeEnd)`. */
function overlapsRange(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): boolean {
  return event.start < rangeEnd && event.end > rangeStart;
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return events
    .filter((e) => overlapsRange(e, dayStart, dayEnd))
    .sort(compareEvents);
}

/** Longer and earlier events first, so spanning bars take the top lanes. */
function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  const startDiff = a.start.getTime() - b.start.getTime();
  if (startDiff !== 0) return startDiff;
  return b.end.getTime() - b.start.getTime() - (a.end.getTime() - a.start.getTime());
}

/**
 * In the time grid an event goes to the all-day row when it is flagged all-day,
 * lasts 24h or more, or crosses midnight. Everything else is drawn on the hours.
 */
export function isAllDayLike(event: CalendarEvent): boolean {
  if (event.allDay) return true;
  const durationMs = event.end.getTime() - event.start.getTime();
  if (durationMs >= 24 * 60 * 60 * 1000) return true;
  // Crosses midnight? The end is exclusive, so ending exactly at midnight is fine.
  return !isSameDay(event.start, new Date(event.end.getTime() - 1));
}

// ---------------------------------------------------------------------------
// Week-row bars (month view and the all-day row)
// ---------------------------------------------------------------------------

export interface RowSegment {
  event: CalendarEvent;
  /** First column (0-6) the bar covers in this row. */
  startCol: number;
  /** Last column, inclusive. */
  endCol: number;
  /** Vertical slot within the row, 0 being the top. */
  lane: number;
  /** Whether the event continues from a previous row / into the next one. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface RowLayout {
  /** Segments that fit within `maxLanes`. */
  visible: RowSegment[];
  /** Per column, how many events were hidden because they did not fit. */
  hiddenPerCol: number[];
  /** Per column, every event touching that day (for the "+N more" dialog). */
  eventsPerCol: CalendarEvent[][];
}

/**
 * Lay events out as horizontal bars across a row of 7 consecutive days.
 * Multi-day events become one bar spanning the columns they cover. Lanes are
 * assigned greedily, and bars that would land below `maxLanes` are hidden and
 * counted per column so the cell can show "+N more".
 */
export function layoutWeekRow(events: CalendarEvent[], days: Date[], maxLanes: number): RowLayout {
  const rowStart = startOfDay(days[0]);
  const rowEnd = addDays(startOfDay(days[days.length - 1]), 1);
  const cols = days.length;

  const candidates = events
    .filter((e) => overlapsRange(e, rowStart, rowEnd))
    .sort(compareEvents);

  // occupied[lane] = set of columns already used in that lane
  const occupied: boolean[][] = [];
  const segments: RowSegment[] = [];

  for (const event of candidates) {
    const startCol = Math.max(0, differenceInCalendarDays(event.start, rowStart));
    // The end is exclusive: subtract 1ms so an event ending at midnight stays on the previous day.
    const lastMoment = new Date(event.end.getTime() - 1);
    const endCol = Math.min(cols - 1, differenceInCalendarDays(lastMoment, rowStart));

    let lane = 0;
    while (true) {
      if (!occupied[lane]) occupied[lane] = [];
      const row = occupied[lane];
      let free = true;
      for (let c = startCol; c <= endCol; c++) {
        if (row[c]) { free = false; break; }
      }
      if (free) break;
      lane++;
    }
    for (let c = startCol; c <= endCol; c++) occupied[lane][c] = true;

    segments.push({
      event,
      startCol,
      endCol,
      lane,
      continuesBefore: event.start < rowStart,
      continuesAfter: event.end > rowEnd,
    });
  }

  const hiddenPerCol = new Array<number>(cols).fill(0);
  const eventsPerCol: CalendarEvent[][] = Array.from({ length: cols }, () => []);
  const visible: RowSegment[] = [];

  for (const seg of segments) {
    for (let c = seg.startCol; c <= seg.endCol; c++) eventsPerCol[c].push(seg.event);
    if (seg.lane < maxLanes) {
      visible.push(seg);
    } else {
      for (let c = seg.startCol; c <= seg.endCol; c++) hiddenPerCol[c]++;
    }
  }

  return { visible, hiddenPerCol, eventsPerCol };
}

// ---------------------------------------------------------------------------
// Timed events in a day column
// ---------------------------------------------------------------------------

export interface TimedBlock {
  event: CalendarEvent;
  /** Minutes from midnight, clipped to the day. */
  startMin: number;
  endMin: number;
  /** Column index and count within the overlap cluster, for side-by-side layout. */
  col: number;
  cols: number;
}

/**
 * Position timed events within one day. Overlapping events are grouped into
 * clusters and share the width of the column, like Google Calendar.
 */
export function layoutTimedEvents(events: CalendarEvent[], day: Date): TimedBlock[] {
  const dayStart = startOfDay(day);
  const dayEndMs = endOfDay(day).getTime() + 1;

  const blocks: TimedBlock[] = events
    .filter((e) => !isAllDayLike(e) && overlapsRange(e, dayStart, new Date(dayEndMs)))
    .sort(compareEvents)
    .map((event) => {
      const startMin = Math.max(0, (event.start.getTime() - dayStart.getTime()) / 60000);
      const rawEnd = Math.min(24 * 60, (event.end.getTime() - dayStart.getTime()) / 60000);
      // Give very short events a readable minimum height.
      const endMin = Math.max(rawEnd, startMin + 20);
      return { event, startMin, endMin, col: 0, cols: 1 };
    });

  // Cluster overlapping blocks, then assign columns greedily within each cluster.
  let cluster: TimedBlock[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    for (const b of cluster) {
      let col = colEnds.findIndex((end) => end <= b.startMin);
      if (col === -1) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = b.endMin;
      b.col = col;
    }
    for (const b of cluster) b.cols = colEnds.length;
    cluster = [];
  };

  for (const b of blocks) {
    if (cluster.length > 0 && b.startMin >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  flush();

  return blocks;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function weekLabel(anchor: Date): string {
  const days = getWeekDays(anchor);
  const first = days[0];
  const last = days[6];
  const sameMonth = first.getMonth() === last.getMonth();
  const a = first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const b = last.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${a} – ${b}, ${last.getFullYear()}`;
}

export function dayLabel(anchor: Date): string {
  return anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function timeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function hourLabel(hour: number): string {
  const d = new Date(2000, 0, 1, hour);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

