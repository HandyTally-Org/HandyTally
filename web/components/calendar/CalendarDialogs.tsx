import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Dialog, Portal } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import type { CalendarEvent } from './types';
import { timeLabel } from './layout';
import { EventChip } from './EventChip';
import { calendarTheme as t, statusLabel } from './theme';
import { useLabels } from '../../hooks/useLabels';

export interface EventAction {
  label: string;
  icon?: string;
  onPress: (event: CalendarEvent) => void;
  loading?: boolean;
  primary?: boolean;
}

interface EventDialogProps {
  event: CalendarEvent | null;
  onDismiss: () => void;
  actions?: EventAction[];
}

function formatWhen(event: CalendarEvent): string {
  const lastMoment = new Date(event.end.getTime() - 1);
  const sameDay = event.start.toDateString() === lastMoment.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (event.allDay) {
    return sameDay
      ? event.start.toLocaleDateString(undefined, dateOpts)
      : `${event.start.toLocaleDateString(undefined, dateOpts)} – ${lastMoment.toLocaleDateString(undefined, dateOpts)}`;
  }
  if (sameDay) {
    return `${event.start.toLocaleDateString(undefined, dateOpts)} · ${timeLabel(event.start)} – ${timeLabel(event.end)}`;
  }
  return `${event.start.toLocaleDateString(undefined, dateOpts)} ${timeLabel(event.start)} – ${event.end.toLocaleDateString(undefined, dateOpts)} ${timeLabel(event.end)}`;
}

/** Details for one event, with the actions the screen wants to offer (open, send invite...). */
export function EventDialog({ event, onDismiss, actions = [] }: EventDialogProps) {
  const jobStatuses = useLabels('job_status');
  return (
    <Portal>
      <Dialog visible={event !== null} onDismiss={onDismiss} style={styles.dialog}>
        {event && (
          <>
            <Dialog.Title style={styles.title}>{event.title}</Dialog.Title>
            <Dialog.Content>
              {event.status && (
                <View style={[styles.statusChip, { backgroundColor: event.color }]}>
                  <Text style={[styles.statusText, { color: event.textColor ?? t.text }]}>{statusLabel(event.status, jobStatuses)}</Text>
                </View>
              )}
              <DetailRow icon="schedule" text={formatWhen(event)} />
              {event.subtitle ? <DetailRow icon="person" text={event.subtitle} /> : null}
              {event.description ? <DetailRow icon="notes" text={event.description} /> : null}
            </Dialog.Content>
            <Dialog.Actions style={styles.actions}>
              <Button onPress={onDismiss}>Close</Button>
              {actions.map((action) => (
                <Button
                  key={action.label}
                  icon={action.icon}
                  mode={action.primary ? 'contained' : 'text'}
                  loading={action.loading}
                  disabled={action.loading}
                  onPress={() => action.onPress(event)}
                >
                  {action.label}
                </Button>
              ))}
            </Dialog.Actions>
          </>
        )}
      </Dialog>
    </Portal>
  );
}

function DetailRow({ icon, text }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; text: string }) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon} size={18} color={t.mutedText} style={styles.detailIcon} />
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

interface DayEventsDialogProps {
  day: Date | null;
  events: CalendarEvent[];
  onDismiss: () => void;
  onEventPress: (event: CalendarEvent) => void;
}

/** The full list behind a "+N more" cell. */
export function DayEventsDialog({ day, events, onDismiss, onEventPress }: DayEventsDialogProps) {
  return (
    <Portal>
      <Dialog visible={day !== null} onDismiss={onDismiss} style={styles.dialog}>
        {day && (
          <>
            <Dialog.Title style={styles.title}>
              {day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </Dialog.Title>
            <Dialog.ScrollArea style={styles.scrollArea}>
              <ScrollView contentContainerStyle={styles.list}>
                {events.map((event) => (
                  <EventChip
                    key={event.id}
                    event={event}
                    showTime
                    onPress={(e) => {
                      onDismiss();
                      onEventPress(e);
                    }}
                    style={styles.listChip}
                  />
                ))}
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={onDismiss}>Close</Button>
            </Dialog.Actions>
          </>
        )}
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxWidth: 480,
    width: '90%',
    alignSelf: 'center',
    backgroundColor: t.background,
  },
  title: {
    fontSize: 20,
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  detailIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    color: t.text,
    lineHeight: 20,
  },
  actions: {
    flexWrap: 'wrap',
  },
  scrollArea: {
    paddingHorizontal: 0,
    maxHeight: 360,
  },
  list: {
    padding: 16,
    gap: 6,
  },
  listChip: {
    paddingVertical: 6,
  },
});
