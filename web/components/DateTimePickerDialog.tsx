import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Portal, Dialog, Button, Text, TextInput, IconButton, HelperText } from 'react-native-paper';
import { calendarTheme } from './calendar/theme';

// A popup for picking a date and a time. The calendar is a plain month grid
// and the time is typed into a text field ("5:00", "17:30", "5pm" all work)
// with an AM/PM toggle, so there is no scrolling wheel to fight with.

type Meridiem = 'AM' | 'PM';

type DateTimePickerDialogProps = {
  visible: boolean;
  title: string;
  /** ISO string of the current value, if any. */
  value?: string | null;
  /** ISO string to open on when there is no value yet (e.g. the start for an end picker). */
  fallback?: string | null;
  onDismiss: () => void;
  onConfirm: (iso: string) => void;
};

type ParsedTime = { hours: number; minutes: number; meridiem: Meridiem };
type DayCell = { y: number; m: number; d: number; inMonth: boolean };

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function to24(hours12: number, meridiem: Meridiem): number {
  if (meridiem === 'AM') return hours12 === 12 ? 0 : hours12;
  return hours12 === 12 ? 12 : hours12 + 12;
}

function to12(hours24: number): { hours: number; meridiem: Meridiem } {
  const meridiem: Meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return { hours, meridiem };
}

/**
 * Parse a typed time. Accepts "5", "5:30", "530", "5pm", "5:30 p.m.", "17:30", "1730".
 * A 12-hour entry without a suffix uses `meridiem`; a 24-hour entry overrides it.
 * Returns null when the text is not a time.
 */
export function parseTimeText(text: string, meridiem: Meridiem): ParsedTime | null {
  const match = text.trim().toLowerCase().match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|p)?\.?m?\.?$/);
  if (!match) return null;
  const rawHours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const suffix = match[3];
  if (minutes > 59) return null;

  if (suffix) {
    if (rawHours < 1 || rawHours > 12) return null;
    const explicit: Meridiem = suffix === 'p' ? 'PM' : 'AM';
    return { hours: to24(rawHours, explicit), minutes, meridiem: explicit };
  }
  if (rawHours > 23) return null;
  if (rawHours === 0 || rawHours > 12) {
    return { hours: rawHours, minutes, meridiem: rawHours >= 12 ? 'PM' : 'AM' };
  }
  return { hours: to24(rawHours, meridiem), minutes, meridiem };
}

/** "5:00" style text for the time field. */
export function formatTimeText(hours24: number, minutes: number): string {
  return `${to12(hours24).hours}:${String(minutes).padStart(2, '0')}`;
}

/** "Tue, Sep 15, 2026 at 5:00 PM" for showing a stored date-time. */
export function formatDateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const { hours, meridiem } = to12(date.getHours());
  return `${day} at ${hours}:${String(date.getMinutes()).padStart(2, '0')} ${meridiem}`;
}

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

function nextHalfHour(): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() <= 30 ? 30 : 60);
  return date;
}

function sameDay(cell: DayCell, date: Date): boolean {
  return cell.y === date.getFullYear() && cell.m === date.getMonth() && cell.d === date.getDate();
}

/** Six rows of seven, padded with the neighbouring months so the grid never jumps in height. */
function buildGrid(year: number, month: number): DayCell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, 1 - firstWeekday + i);
    return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate(), inMonth: date.getMonth() === month };
  });
}

export function DateTimePickerDialog({ visible, title, value, fallback, onDismiss, onConfirm }: DateTimePickerDialogProps) {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selected, setSelected] = useState<DayCell>(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate(), inMonth: true };
  });
  const [timeText, setTimeText] = useState('');
  const [meridiem, setMeridiem] = useState<Meridiem>('AM');
  const [showError, setShowError] = useState(false);

  // Reset to the current value every time the popup opens.
  useEffect(() => {
    if (!visible) return;
    const base = parseIso(value) ?? parseIso(fallback) ?? nextHalfHour();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setSelected({ y: base.getFullYear(), m: base.getMonth(), d: base.getDate(), inMonth: true });
    setTimeText(formatTimeText(base.getHours(), base.getMinutes()));
    setMeridiem(to12(base.getHours()).meridiem);
    setShowError(false);
  }, [visible, value, fallback]);

  const parsedTime = useMemo(() => parseTimeText(timeText, meridiem), [timeText, meridiem]);
  const today = new Date();
  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const result = parsedTime
    ? new Date(selected.y, selected.m, selected.d, parsedTime.hours, parsedTime.minutes, 0, 0)
    : null;

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelected({ y: today.getFullYear(), m: today.getMonth(), d: today.getDate(), inMonth: true });
  };

  const pickDay = (cell: DayCell) => {
    setSelected(cell);
    if (!cell.inMonth) {
      setViewYear(cell.y);
      setViewMonth(cell.m);
    }
  };

  // Tidy the text once the user leaves the field ("5pm" becomes "5:00" + PM).
  const normalizeTime = () => {
    if (!parsedTime) {
      setShowError(timeText.trim().length > 0);
      return;
    }
    setTimeText(formatTimeText(parsedTime.hours, parsedTime.minutes));
    setMeridiem(parsedTime.meridiem);
    setShowError(false);
  };

  // Switching AM/PM keeps the typed hour and minute and only flips the half of the day.
  const chooseMeridiem = (next: Meridiem) => {
    if (parsedTime) setTimeText(formatTimeText(parsedTime.hours, parsedTime.minutes));
    setMeridiem(next);
  };

  const confirm = () => {
    if (!result) {
      setShowError(true);
      return;
    }
    onConfirm(result.toISOString());
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={pickerStyles.dialog}>
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>{title}</Text>
          <IconButton icon="close" size={20} onPress={onDismiss} accessibilityLabel="Close" />
        </View>

        <View style={pickerStyles.body}>
          <View style={pickerStyles.monthRow}>
            <Text style={pickerStyles.monthLabel}>{monthLabel}</Text>
            <View style={pickerStyles.monthControls}>
              <Pressable onPress={goToToday} style={pickerStyles.todayButton}>
                <Text style={pickerStyles.todayButtonText}>Today</Text>
              </Pressable>
              <IconButton icon="chevron-left" size={22} onPress={() => shiftMonth(-1)} accessibilityLabel="Previous month" />
              <IconButton icon="chevron-right" size={22} onPress={() => shiftMonth(1)} accessibilityLabel="Next month" />
            </View>
          </View>

          <View style={pickerStyles.weekRow}>
            {WEEKDAYS.map((label, i) => (
              <Text key={i} style={pickerStyles.weekday}>{label}</Text>
            ))}
          </View>

          {Array.from({ length: 6 }, (_, row) => (
            <View key={row} style={pickerStyles.weekRow}>
              {grid.slice(row * 7, row * 7 + 7).map((cell) => {
                const isSelected = cell.y === selected.y && cell.m === selected.m && cell.d === selected.d;
                const isToday = sameDay(cell, today);
                return (
                  <Pressable
                    key={`${cell.y}-${cell.m}-${cell.d}`}
                    onPress={() => pickDay(cell)}
                    style={(state) => [
                      pickerStyles.dayCell,
                      ((state as { hovered?: boolean }).hovered || state.pressed) && !isSelected && pickerStyles.dayCellHover,
                      isToday && !isSelected && pickerStyles.dayCellToday,
                      isSelected && pickerStyles.dayCellSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={new Date(cell.y, cell.m, cell.d).toDateString()}
                  >
                    <Text
                      style={[
                        pickerStyles.dayText,
                        !cell.inMonth && pickerStyles.dayTextOutside,
                        isToday && !isSelected && pickerStyles.dayTextToday,
                        isSelected && pickerStyles.dayTextSelected,
                      ]}
                    >
                      {cell.d}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={pickerStyles.divider} />

          <View style={pickerStyles.timeRow}>
            <Text style={pickerStyles.timeLabel}>Time</Text>
            <TextInput
              mode="outlined"
              dense
              value={timeText}
              onChangeText={(text) => {
                setTimeText(text);
                if (showError) setShowError(false);
              }}
              onBlur={normalizeTime}
              onSubmitEditing={confirm}
              placeholder="5:00"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              error={showError}
              style={pickerStyles.timeInput}
              outlineColor={calendarTheme.borderStrong}
              activeOutlineColor={calendarTheme.accent}
              left={<TextInput.Icon icon="clock-outline" color={calendarTheme.mutedText} />}
            />
            <View style={pickerStyles.segment}>
              {(['AM', 'PM'] as Meridiem[]).map((option) => {
                const active = meridiem === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => chooseMeridiem(option)}
                    style={[pickerStyles.segmentButton, active && pickerStyles.segmentButtonActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[pickerStyles.segmentText, active && pickerStyles.segmentTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {showError ? (
            <HelperText type="error" visible style={pickerStyles.helper}>
              Enter a time like 5:00, 5:30 pm or 17:30
            </HelperText>
          ) : (
            <Text style={pickerStyles.summary}>{result ? formatDateTimeLabel(result.toISOString()) : ' '}</Text>
          )}
        </View>

        <Dialog.Actions style={pickerStyles.actions}>
          <Button onPress={onDismiss} textColor={calendarTheme.mutedText}>Cancel</Button>
          <Button mode="contained" onPress={confirm} disabled={!result} style={pickerStyles.doneButton}>
            Done
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const CELL = 38;

const pickerStyles = StyleSheet.create({
  dialog: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 14,
    backgroundColor: calendarTheme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 6,
    paddingTop: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: calendarTheme.text,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: calendarTheme.text,
    paddingLeft: 4,
  },
  monthControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: calendarTheme.buttonBorder,
    backgroundColor: calendarTheme.buttonBackground,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: calendarTheme.text,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  weekday: {
    width: CELL,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: calendarTheme.faintText,
    paddingVertical: 4,
  },
  dayCell: {
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellHover: {
    backgroundColor: calendarTheme.mutedBackground,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: calendarTheme.accent,
  },
  dayCellSelected: {
    backgroundColor: calendarTheme.accent,
  },
  dayText: {
    fontSize: 14,
    color: calendarTheme.text,
  },
  dayTextOutside: {
    color: calendarTheme.faintText,
  },
  dayTextToday: {
    color: calendarTheme.accent,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: calendarTheme.accentText,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: calendarTheme.border,
    marginVertical: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: calendarTheme.text,
    width: 40,
  },
  timeInput: {
    flex: 1,
    backgroundColor: calendarTheme.background,
    fontSize: 15,
  },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: calendarTheme.borderStrong,
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: calendarTheme.buttonBackground,
  },
  segmentButtonActive: {
    backgroundColor: calendarTheme.accent,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: calendarTheme.mutedText,
  },
  segmentTextActive: {
    color: calendarTheme.accentText,
  },
  helper: {
    paddingLeft: 50,
  },
  summary: {
    fontSize: 13,
    color: calendarTheme.mutedText,
    paddingLeft: 50,
    paddingTop: 8,
    minHeight: 26,
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  doneButton: {
    borderRadius: 8,
  },
});
