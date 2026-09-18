import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { themed } from '../constants/Colors';

// HT-62: the one way a job status, invoice status or client tag is drawn as a
// pill, whether it is a filter on the Jobs / Invoices / Clients pages, a
// read-only status in a table row, or the live preview in Settings > Labels.
// Only the colour comes from the label definition (constants/labels.ts, as
// renamed / recoloured by the organisation, HT-51); font, border, radius and
// padding are fixed here so the pills look the same on every page. Built on
// plain RN primitives rather than Paper's Chip / Button, whose defaults are
// what made the three pages drift apart.

/** The text colour that reads on a fill: the label's own on a pale fill, white on a saturated one. */
export function pillTextOn(bg: string, preferred: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(bg.trim());
  if (!hex) return preferred;
  const n = parseInt(hex[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? preferred : '#ffffff';
}

// HT-68: the neutral "All" pill and the outlined (unselected) state follow
// the theme; a label's own fill/text colours are data and stay as they are.
const NEUTRAL_FILL = themed.primary;
const NEUTRAL_TEXT = themed.onPrimary;
const OUTLINE_BG = themed.panel;
const OUTLINE_BORDER = themed.line;
const OUTLINE_BORDER_HOVER = themed.faint;
const OUTLINE_TEXT = themed.text;

export type LabelPillProps = {
  label: string;
  /** Fill when selected. Omit for a neutral pill (the "All" filter). */
  color?: string;
  /** Text on the fill; falls back to white on a saturated fill. */
  textColor?: string;
  /**
   * Filled (true) or outlined (false). A pill without `onPress` is a static
   * badge and is filled unless told otherwise; a pressable one is outlined
   * until selected.
   */
  selected?: boolean;
  onPress?: () => void;
  /** `md` for filter rows, `sm` for a status inside a table row or card. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function LabelPill({
  label,
  color,
  textColor,
  selected,
  onPress,
  size = 'md',
  style,
  accessibilityLabel,
}: LabelPillProps) {
  const [hovered, setHovered] = useState(false);
  const filled = selected ?? !onPress;
  const fill = color ?? NEUTRAL_FILL;
  const text = color ? pillTextOn(fill, textColor ?? OUTLINE_TEXT) : NEUTRAL_TEXT;

  const boxStyle = [
    styles.base,
    size === 'sm' ? styles.sm : styles.md,
    filled
      ? { backgroundColor: fill, borderColor: fill }
      : { backgroundColor: OUTLINE_BG, borderColor: hovered ? OUTLINE_BORDER_HOVER : OUTLINE_BORDER },
    style,
  ];
  const labelStyle = [styles.text, size === 'sm' ? styles.textSm : styles.textMd, { color: filled ? text : OUTLINE_TEXT }];

  if (!onPress) {
    return (
      <View style={boxStyle} accessibilityLabel={accessibilityLabel}>
        <Text style={labelStyle} numberOfLines={1}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityState={{ selected: filled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [boxStyle, (pressed || (hovered && filled)) && styles.dimmed]}
    >
      <Text style={labelStyle} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** A wrapping row of pills with one gap, for the filter strip at the top of a list page. */
export function LabelPillRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  md: { paddingVertical: 6, paddingHorizontal: 14, minHeight: 32 },
  sm: { paddingVertical: 2, paddingHorizontal: 10, minHeight: 22 },
  text: { fontWeight: '600' },
  textMd: { fontSize: 13, lineHeight: 18 },
  textSm: { fontSize: 12, lineHeight: 16 },
  dimmed: { opacity: 0.85 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
});
