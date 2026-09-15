import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { CalendarEvent } from './types';
import { calendarTheme as t } from './theme';
import { timeLabel } from './layout';

interface EventChipProps {
  event: CalendarEvent;
  onPress: (event: CalendarEvent) => void;
  style?: ViewStyle;
  /** Show the start time before the title (month view chips for timed events). */
  showTime?: boolean;
  /** Second line with the subtitle and time range (time-grid blocks). */
  detailed?: boolean;
  /** Round only the ends that start/finish within the visible row. */
  continuesBefore?: boolean;
  continuesAfter?: boolean;
}

export function EventChip({ event, onPress, style, showTime, detailed, continuesBefore, continuesAfter }: EventChipProps) {
  const textColor = event.textColor ?? t.text;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={() => onPress(event)}
      style={[
        styles.chip,
        { backgroundColor: event.color, borderLeftColor: textColor },
        continuesBefore && styles.openStart,
        continuesAfter && styles.openEnd,
        style,
      ]}
    >
      <View style={styles.titleRow}>
        {showTime && !event.allDay && (
          <Text style={[styles.time, { color: textColor }]} numberOfLines={1}>{timeLabel(event.start)}</Text>
        )}
        <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>{event.title}</Text>
      </View>
      {detailed && (
        <Text style={[styles.subtitle, { color: textColor }]} numberOfLines={1}>
          {timeLabel(event.start)} – {timeLabel(event.end)}{event.subtitle ? ` · ${event.subtitle}` : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  openStart: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeftWidth: 0,
  },
  openEnd: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 4,
    opacity: 0.85,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 11,
    opacity: 0.85,
    marginTop: 1,
  },
});
