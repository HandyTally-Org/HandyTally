import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getWeek, isToday } from 'date-fns';
import type { CalendarEvent } from './types';
import { hourLabel, isAllDayLike, layoutTimedEvents, layoutWeekRow } from './layout';
import { EventChip } from './EventChip';
import { ALL_DAY_LANE_HEIGHT, calendarTheme as t, HOUR_HEIGHT, TIME_GUTTER_WIDTH } from './theme';

// On web the hour grid sits in a vertical ScrollView, whose native scrollbar
// eats into the row's width. The day headers and the all-day row live outside
// that ScrollView, so without this they render slightly wider than the hour
// columns below and drift out of alignment (worst on the rightmost day).
// Padding both fixed rows by the browser's actual scrollbar width keeps every
// row the same width. Native has no scrollbar chrome, so this is always 0 there.
let cachedScrollbarWidth: number | null = null;

function measureScrollbarWidth(): number {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 0;
  if (cachedScrollbarWidth !== null) return cachedScrollbarWidth;

  const outer = document.createElement('div');
  outer.style.cssText = 'visibility:hidden;position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;';
  const inner = document.createElement('div');
  inner.style.cssText = 'width:100%;height:200px;';
  outer.appendChild(inner);
  document.body.appendChild(outer);
  cachedScrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  document.body.removeChild(outer);
  return cachedScrollbarWidth;
}

interface TimeGridViewProps {
  /** One date for the day view, seven for the week view. */
  days: Date[];
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  /** An empty hour slot was pressed. */
  onSlotPress: (start: Date) => void;
  /** Pressing a day header switches to that day. */
  onDayPress?: (day: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SCROLL_TO_HOUR = 7;

export function TimeGridView({ days, events, onEventPress, onSlotPress, onDayPress }: TimeGridViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [now, setNow] = useState(() => new Date());
  const [scrollbarWidth] = useState(measureScrollbarWidth);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Start the day at working hours rather than midnight.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: SCROLL_TO_HOUR * HOUR_HEIGHT - 8, animated: false });
  }, [days.length]);

  const allDayEvents = useMemo(() => events.filter(isAllDayLike), [events]);
  const allDayLayout = useMemo(() => layoutWeekRow(allDayEvents, days, 50), [allDayEvents, days]);
  const allDayLanes = allDayLayout.visible.reduce((max, seg) => Math.max(max, seg.lane + 1), 0);
  const allDayHeight = Math.max(1, allDayLanes) * ALL_DAY_LANE_HEIGHT + 4;

  const weekNumber = getWeek(days[0]);
  const cols = days.length;

  return (
    <View style={styles.container}>
      {/* Day headers */}
      <View style={styles.headerRow}>
        <View style={styles.gutterHeader}>
          {cols > 1 && (
            <>
              <Text style={styles.gutterHeaderLabel}>Week</Text>
              <Text style={styles.gutterHeaderNumber}>{weekNumber}</Text>
            </>
          )}
        </View>
        {days.map((day) => {
          const today = isToday(day);
          return (
            <TouchableOpacity
              key={day.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={day.toDateString()}
              disabled={!onDayPress || cols === 1}
              onPress={() => onDayPress?.(day)}
              style={[styles.dayHeader, today && styles.todayColumn]}
            >
              <Text style={[styles.dayHeaderWeekday, today && styles.todayText]}>
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </Text>
              <View style={[styles.dayHeaderBadge, today && styles.todayBadge]}>
                <Text style={[styles.dayHeaderNumber, today && styles.todayBadgeText]}>{day.getDate()}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {scrollbarWidth > 0 && <View style={{ width: scrollbarWidth }} />}
      </View>

      {/* All-day row */}
      <View style={[styles.allDayRow, { height: allDayHeight }]}>
        <View style={styles.gutter}>
          <Text style={styles.gutterText}>All day</Text>
        </View>
        <View style={styles.allDayColumns}>
          {days.map((day) => (
            <View key={day.toISOString()} style={[styles.allDayColumn, isToday(day) && styles.todayColumn]} />
          ))}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {allDayLayout.visible.map((seg) => (
              <View
                key={`${seg.event.id}-${seg.startCol}`}
                pointerEvents="box-none"
                style={[
                  styles.allDaySlot,
                  {
                    left: `${(seg.startCol / cols) * 100}%` as const,
                    width: `${((seg.endCol - seg.startCol + 1) / cols) * 100}%` as const,
                    top: 2 + seg.lane * ALL_DAY_LANE_HEIGHT,
                  },
                ]}
              >
                <EventChip
                  event={seg.event}
                  onPress={onEventPress}
                  continuesBefore={seg.continuesBefore}
                  continuesAfter={seg.continuesAfter}
                  style={styles.allDayChip}
                />
              </View>
            ))}
          </View>
        </View>
        {scrollbarWidth > 0 && <View style={{ width: scrollbarWidth }} />}
      </View>

      {/* Hours */}
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.gutter}>
          {HOURS.map((h) => (
            <View key={h} style={[styles.gutterHour, { top: h * HOUR_HEIGHT - 8 }]}>
              {h > 0 && <Text style={styles.gutterText}>{hourLabel(h)}</Text>}
            </View>
          ))}
        </View>
        {days.map((day) => (
          <DayColumn
            key={day.toISOString()}
            day={day}
            events={events}
            now={now}
            onEventPress={onEventPress}
            onSlotPress={onSlotPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface DayColumnProps {
  day: Date;
  events: CalendarEvent[];
  now: Date;
  onEventPress: (event: CalendarEvent) => void;
  onSlotPress: (start: Date) => void;
}

function DayColumn({ day, events, now, onEventPress, onSlotPress }: DayColumnProps) {
  const blocks = useMemo(() => layoutTimedEvents(events, day), [events, day]);
  const today = isToday(day);
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT;

  return (
    <View style={[styles.dayColumn, today && styles.todayColumn]}>
      {HOURS.map((h) => (
        <TouchableOpacity
          key={h}
          accessibilityRole="button"
          accessibilityLabel={`${hourLabel(h)} on ${day.toDateString()}`}
          activeOpacity={0.6}
          onPress={() => {
            const start = new Date(day);
            start.setHours(h, 0, 0, 0);
            onSlotPress(start);
          }}
          style={styles.hourSlot}
        >
          <View style={styles.halfHourLine} />
        </TouchableOpacity>
      ))}

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {blocks.map((b) => (
          <View
            key={b.event.id}
            pointerEvents="box-none"
            style={[
              styles.blockSlot,
              {
                top: (b.startMin / 60) * HOUR_HEIGHT,
                height: ((b.endMin - b.startMin) / 60) * HOUR_HEIGHT,
                left: `${(b.col / b.cols) * 100}%` as const,
                width: `${(1 / b.cols) * 100}%` as const,
              },
            ]}
          >
            <EventChip event={b.event} onPress={onEventPress} detailed={b.endMin - b.startMin >= 40} style={styles.block} />
          </View>
        ))}
        {today && (
          <View style={[styles.nowLine, { top: nowTop }]} pointerEvents="none">
            <View style={styles.nowDot} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  gutterHeader: {
    width: TIME_GUTTER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: t.border,
  },
  gutterHeaderLabel: {
    fontSize: 10,
    color: t.mutedText,
    textTransform: 'uppercase',
  },
  gutterHeaderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: t.text,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: t.border,
  },
  dayHeaderWeekday: {
    fontSize: 11,
    fontWeight: '600',
    color: t.mutedText,
    textTransform: 'uppercase',
  },
  dayHeaderBadge: {
    marginTop: 2,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 4,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeaderNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: t.text,
  },
  todayText: {
    color: t.accent,
  },
  todayBadge: {
    backgroundColor: t.accent,
  },
  todayBadgeText: {
    color: t.accentText,
  },
  todayColumn: {
    backgroundColor: t.todayColumn,
  },
  allDayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: t.borderStrong,
  },
  allDayColumns: {
    flex: 1,
    flexDirection: 'row',
  },
  allDayColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: t.border,
  },
  allDaySlot: {
    position: 'absolute',
    height: ALL_DAY_LANE_HEIGHT,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  allDayChip: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 0,
  },
  gutter: {
    width: TIME_GUTTER_WIDTH,
    borderRightWidth: 1,
    borderRightColor: t.border,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
  gutterHour: {
    position: 'absolute',
    right: 6,
  },
  gutterText: {
    fontSize: 11,
    color: t.mutedText,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    height: 24 * HOUR_HEIGHT,
  },
  dayColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: t.border,
  },
  hourSlot: {
    height: HOUR_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: t.border,
    justifyContent: 'center',
  },
  halfHourLine: {
    height: 1,
    backgroundColor: t.mutedBackground,
  },
  blockSlot: {
    position: 'absolute',
    paddingHorizontal: 1,
    paddingBottom: 2,
  },
  block: {
    flex: 1,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: t.nowLine,
  },
  nowDot: {
    position: 'absolute',
    left: -4,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.nowLine,
  },
});
