import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { addHours } from 'date-fns';
import type { CalendarEvent, CalendarView, DateRange } from './types';
import { dayLabel, getVisibleRange, getWeekDays, monthLabel, stepAnchor, weekLabel } from './layout';
import { CalendarToolbar } from './CalendarToolbar';
import { MonthView } from './MonthView';
import { TimeGridView } from './TimeGridView';
import { DayEventsDialog } from './CalendarDialogs';
import { calendarTheme as t } from './theme';

export interface CalendarProps {
  events: CalendarEvent[];
  initialView?: CalendarView;
  initialDate?: Date;
  /** Fires on mount and whenever the visible dates change; use it to load events. */
  onRangeChange?: (range: DateRange, view: CalendarView) => void;
  onEventPress: (event: CalendarEvent) => void;
  /** An empty day cell (month) or hour slot (week/day) was pressed. */
  onSlotPress?: (start: Date, end: Date) => void;
  /** The toolbar's "+ New" button; hidden when omitted. */
  onNew?: () => void;
  loading?: boolean;
}

// Pressing a day in month view suggests a working-hours job rather than midnight.
const MONTH_SLOT_START_HOUR = 9;

export function Calendar({
  events,
  initialView = 'month',
  initialDate,
  onRangeChange,
  onEventPress,
  onSlotPress,
  onNew,
  loading = false,
}: CalendarProps) {
  const [view, setView] = useState<CalendarView>(initialView);
  const [anchor, setAnchor] = useState<Date>(() => initialDate ?? new Date());
  const [moreDay, setMoreDay] = useState<{ day: Date; events: CalendarEvent[] } | null>(null);

  const range = useMemo(() => getVisibleRange(view, anchor), [view, anchor]);

  // `range` is memoised on view + anchor, so this fires once per navigation.
  // Parents should pass a stable (useCallback) handler to avoid refetch loops.
  useEffect(() => {
    onRangeChange?.(range, view);
  }, [range, view, onRangeChange]);

  const title = view === 'month' ? monthLabel(anchor) : view === 'week' ? weekLabel(anchor) : dayLabel(anchor);

  const goPrev = useCallback(() => setAnchor((a) => stepAnchor(view, a, -1)), [view]);
  const goNext = useCallback(() => setAnchor((a) => stepAnchor(view, a, 1)), [view]);
  const goToday = useCallback(() => setAnchor(new Date()), []);

  const openDay = useCallback((day: Date) => {
    setAnchor(day);
    setView('day');
  }, []);

  const handleMonthDayPress = useCallback(
    (day: Date) => {
      if (!onSlotPress) return;
      const start = new Date(day);
      start.setHours(MONTH_SLOT_START_HOUR, 0, 0, 0);
      onSlotPress(start, addHours(start, 1));
    },
    [onSlotPress],
  );

  const handleHourPress = useCallback(
    (start: Date) => {
      onSlotPress?.(start, addHours(start, 1));
    },
    [onSlotPress],
  );

  const showMore = useCallback((day: Date, dayEvents: CalendarEvent[]) => setMoreDay({ day, events: dayEvents }), []);

  const gridDays = useMemo(() => (view === 'week' ? getWeekDays(anchor) : [anchor]), [view, anchor]);

  return (
    <View style={styles.container}>
      <CalendarToolbar
        title={title}
        view={view}
        onViewChange={setView}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onNew={onNew}
      />

      <View style={styles.body}>
        {view === 'month' ? (
          <MonthView
            anchor={anchor}
            events={events}
            onEventPress={onEventPress}
            onDayPress={handleMonthDayPress}
            onShowMore={showMore}
          />
        ) : (
          <TimeGridView
            days={gridDays}
            events={events}
            onEventPress={onEventPress}
            onSlotPress={handleHourPress}
            onDayPress={openDay}
          />
        )}

        {loading && (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator size="small" color={t.accent} />
          </View>
        )}
      </View>

      <DayEventsDialog
        day={moreDay?.day ?? null}
        events={moreDay?.events ?? []}
        onDismiss={() => setMoreDay(null)}
        onEventPress={onEventPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    borderRadius: 16,
    backgroundColor: t.background,
  },
});

export type { CalendarEvent, CalendarView, DateRange } from './types';
export { colorsForStatus } from './theme';
export type { EventAction } from './CalendarDialogs';
export { EventDialog } from './CalendarDialogs';
