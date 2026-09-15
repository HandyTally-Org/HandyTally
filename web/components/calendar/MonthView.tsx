import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { isSameDay, isSameMonth, isToday } from 'date-fns';
import type { CalendarEvent } from './types';
import { getMonthGrid, layoutWeekRow } from './layout';
import { EventChip } from './EventChip';
import { calendarTheme as t, MONTH_HEADER_HEIGHT, MONTH_LANE_HEIGHT, MONTH_MORE_HEIGHT } from './theme';

interface MonthViewProps {
  anchor: Date;
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  onDayPress: (day: Date) => void;
  onShowMore: (day: Date, events: CalendarEvent[]) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({ anchor, events, onEventPress, onDayPress, onShowMore }: MonthViewProps) {
  const rows = useMemo(() => getMonthGrid(anchor), [anchor]);
  const [gridHeight, setGridHeight] = useState(0);

  // How many event bars fit in a row once the day number and the "+N more"
  // line have their space. Falls back to 3 until the grid has been measured.
  const maxLanes = gridHeight
    ? Math.max(1, Math.floor((gridHeight / 6 - MONTH_HEADER_HEIGHT - MONTH_MORE_HEIGHT) / MONTH_LANE_HEIGHT))
    : 3;

  const onGridLayout = (e: LayoutChangeEvent) => setGridHeight(e.nativeEvent.layout.height);

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid} onLayout={onGridLayout}>
        {rows.map((days, rowIndex) => (
          <MonthRow
            key={days[0].toISOString()}
            days={days}
            anchor={anchor}
            events={events}
            maxLanes={maxLanes}
            isLastRow={rowIndex === rows.length - 1}
            onEventPress={onEventPress}
            onDayPress={onDayPress}
            onShowMore={onShowMore}
          />
        ))}
      </View>
    </View>
  );
}

interface MonthRowProps {
  days: Date[];
  anchor: Date;
  events: CalendarEvent[];
  maxLanes: number;
  isLastRow: boolean;
  onEventPress: (event: CalendarEvent) => void;
  onDayPress: (day: Date) => void;
  onShowMore: (day: Date, events: CalendarEvent[]) => void;
}

function MonthRow({ days, anchor, events, maxLanes, isLastRow, onEventPress, onDayPress, onShowMore }: MonthRowProps) {
  const layout = useMemo(() => layoutWeekRow(events, days, maxLanes), [events, days, maxLanes]);
  const moreTop = MONTH_HEADER_HEIGHT + maxLanes * MONTH_LANE_HEIGHT;

  return (
    <View style={[styles.row, isLastRow && styles.lastRow]}>
      {/* Day cells: background, day number, "+N more" */}
      <View style={styles.cellLayer}>
        {days.map((day, col) => {
          const inMonth = isSameMonth(day, anchor);
          const today = isToday(day);
          const hidden = layout.hiddenPerCol[col];
          return (
            <TouchableOpacity
              key={day.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={day.toDateString()}
              activeOpacity={0.7}
              onPress={() => onDayPress(day)}
              style={[styles.cell, col === 6 && styles.lastCell, !inMonth && styles.outsideCell]}
            >
              <View style={styles.dayNumberRow}>
                <View style={[styles.dayNumberBadge, today && styles.todayBadge]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      !inMonth && styles.outsideDayNumber,
                      today && styles.todayDayNumber,
                    ]}
                  >
                    {day.getDate() === 1
                      ? day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : day.getDate()}
                  </Text>
                </View>
              </View>
              {hidden > 0 && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${hidden} more events on ${day.toDateString()}`}
                  onPress={() => onShowMore(day, layout.eventsPerCol[col])}
                  style={[styles.more, { top: moreTop }]}
                >
                  <Text style={styles.moreText}>+{hidden} more</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Event bars, absolutely positioned over the cells */}
      <View style={styles.barLayer} pointerEvents="box-none">
        {layout.visible.map((seg) => {
          const span = seg.endCol - seg.startCol + 1;
          const singleDay = isSameDay(seg.event.start, new Date(seg.event.end.getTime() - 1));
          return (
            <View
              key={`${seg.event.id}-${seg.startCol}`}
              pointerEvents="box-none"
              style={[
                styles.barSlot,
                {
                  left: `${(seg.startCol / 7) * 100}%` as const,
                  width: `${(span / 7) * 100}%` as const,
                  top: MONTH_HEADER_HEIGHT + seg.lane * MONTH_LANE_HEIGHT,
                },
              ]}
            >
              <EventChip
                event={seg.event}
                onPress={onEventPress}
                showTime={singleDay}
                continuesBefore={seg.continuesBefore}
                continuesAfter={seg.continuesAfter}
                style={styles.bar}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  weekdayCell: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: t.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flex: 1,
  },
  row: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  cellLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: t.border,
    overflow: 'hidden',
  },
  lastCell: {
    borderRightWidth: 0,
  },
  outsideCell: {
    backgroundColor: t.mutedBackground,
  },
  dayNumberRow: {
    height: MONTH_HEADER_HEIGHT,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dayNumberBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBadge: {
    backgroundColor: t.accent,
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '500',
    color: t.text,
  },
  outsideDayNumber: {
    color: t.faintText,
  },
  todayDayNumber: {
    color: t.accentText,
    fontWeight: '700',
  },
  more: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: MONTH_MORE_HEIGHT,
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 11,
    fontWeight: '500',
    color: t.mutedText,
  },
  barLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  barSlot: {
    position: 'absolute',
    height: MONTH_LANE_HEIGHT,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  bar: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 0,
  },
});
