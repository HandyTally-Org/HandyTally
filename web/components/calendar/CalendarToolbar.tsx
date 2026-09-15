import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Menu } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import type { CalendarView } from './types';
import { calendarTheme as t } from './theme';

interface CalendarToolbarProps {
  title: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew?: () => void;
}

const VIEW_OPTIONS: { value: CalendarView; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }[] = [
  { value: 'day', label: 'Day', icon: 'view-day' },
  { value: 'week', label: 'Week', icon: 'view-week' },
  { value: 'month', label: 'Month', icon: 'calendar-view-month' },
];

export function CalendarToolbar({ title, view, onViewChange, onPrev, onNext, onToday, onNew }: CalendarToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const current = VIEW_OPTIONS.find((o) => o.value === view) ?? VIEW_OPTIONS[2];

  return (
    <View style={styles.toolbar}>
      <View style={styles.group}>
        <View style={styles.navPair}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Previous ${view}`}
            onPress={onPrev}
            style={[styles.navButton, styles.navButtonLeft]}
          >
            <MaterialIcons name="chevron-left" size={20} color={t.text} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Next ${view}`}
            onPress={onNext}
            style={styles.navButton}
          >
            <MaterialIcons name="chevron-right" size={20} color={t.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity accessibilityRole="button" onPress={onToday} style={styles.button}>
          <Text style={styles.buttonText}>Today</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <View style={styles.group}>
        <Menu
          visible={menuOpen}
          onDismiss={() => setMenuOpen(false)}
          anchor={
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Change view"
              onPress={() => setMenuOpen(true)}
              style={styles.button}
            >
              <MaterialIcons name={current.icon} size={18} color={t.text} style={styles.buttonIcon} />
              <Text style={styles.buttonText}>{current.label}</Text>
              <MaterialIcons name="expand-more" size={18} color={t.mutedText} />
            </TouchableOpacity>
          }
        >
          {VIEW_OPTIONS.map((option) => (
            <Menu.Item
              key={option.value}
              title={option.label}
              leadingIcon={option.value === 'month' ? 'calendar-month' : option.value === 'week' ? 'view-week' : 'view-day'}
              trailingIcon={option.value === view ? 'check' : undefined}
              onPress={() => {
                setMenuOpen(false);
                onViewChange(option.value);
              }}
            />
          ))}
        </Menu>

        {onNew && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="New job"
            onPress={onNew}
            style={[styles.button, styles.primaryButton]}
          >
            <MaterialIcons name="add" size={18} color={t.accentText} style={styles.buttonIcon} />
            <Text style={[styles.buttonText, styles.primaryButtonText]}>New</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
    backgroundColor: t.background,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navPair: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: t.buttonBorder,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: t.buttonBackground,
  },
  navButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonLeft: {
    borderRightWidth: 1,
    borderRightColor: t.buttonBorder,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: t.buttonBorder,
    borderRadius: 8,
    backgroundColor: t.buttonBackground,
  },
  buttonIcon: {
    marginRight: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: t.text,
  },
  primaryButton: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  primaryButtonText: {
    color: t.accentText,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: t.text,
    marginLeft: 4,
  },
});
