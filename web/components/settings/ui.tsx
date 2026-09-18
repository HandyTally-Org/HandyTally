import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Menu } from 'react-native-paper';
import { useState } from 'react';

// HT-52 / HT-51: the building blocks of the Settings editors, styled to the
// approved HT-45 mock-up (§4.6) rather than stock Material widgets: quiet
// bordered inputs, a dark primary button, underline tabs, dashed add-panels,
// small square colour swatches. Web-only surface, so plain RN primitives.

export const st = {
  text: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#e5e7eb',
  rowBorder: '#f3f4f6',
  inputBorder: '#d1d5db',
  pageBg: '#f5f6f8',
  panelBg: '#ffffff',
  softBg: '#f9fafb',
  primary: '#111827',
  danger: '#dc2626',
  addedPillBg: '#ede9fe',
  addedPillText: '#4c1d95',
};

/** The six-colour picker from the mock-up: chip fill + matching text colour. */
export const COLOR_SWATCHES = [
  { key: 'amber', color: '#fef3c7', textColor: '#92400e' },
  { key: 'blue', color: '#dbeafe', textColor: '#1e3a8a' },
  { key: 'green', color: '#dcfce7', textColor: '#14532d' },
  { key: 'red', color: '#fee2e2', textColor: '#991b1b' },
  { key: 'purple', color: '#ede9fe', textColor: '#4c1d95' },
  { key: 'gray', color: '#e5e7eb', textColor: '#374151' },
] as const;

export function SettingsInput({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={st.faint}
      accessibilityLabel={accessibilityLabel}
      style={[ui.input, style]}
    />
  );
}

/** A quiet select: bordered anchor with a chevron, options in a Paper menu. */
export function SelectMenu({
  value,
  options,
  onChange,
  accessibilityLabel,
  style,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.value === value);
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Pressable onPress={() => setOpen(true)} accessibilityLabel={accessibilityLabel} accessibilityRole="button" style={[ui.select, style]}>
          <Text style={ui.selectText}>{current?.label ?? value}</Text>
          <Text style={ui.selectChevron}>▾</Text>
        </Pressable>
      }
    >
      {options.map(option => (
        <Menu.Item key={option.value} title={option.label} onPress={() => { onChange(option.value); setOpen(false); }} />
      ))}
    </Menu>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ hovered }: any) => [ui.btn, ui.btnPrimary, hovered && !disabled && ui.btnPrimaryHover, disabled && ui.btnDisabled]}
    >
      <Text style={ui.btnPrimaryText}>{label}</Text>
    </Pressable>
  );
}

export function OutlineButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ hovered }: any) => [ui.btn, ui.btnOutline, hovered && !disabled && ui.btnOutlineHover, disabled && ui.btnDisabled]}
    >
      <Text style={ui.btnOutlineText}>{label}</Text>
    </Pressable>
  );
}

/** The red "Remove" of the mock-up's table rows. */
export function LinkButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} style={({ hovered }: any) => [ui.link, hovered && ui.linkHover]}>
      <Text style={ui.linkText}>{label}</Text>
    </Pressable>
  );
}

export function ArrowButton({ dir, onPress, disabled, accessibilityLabel }: { dir: 'up' | 'down'; onPress: () => void; disabled?: boolean; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ hovered }: any) => [ui.arrow, hovered && !disabled && ui.arrowHover, disabled && ui.btnDisabled]}
    >
      <Text style={ui.arrowText}>{dir === 'up' ? '▲' : '▼'}</Text>
    </Pressable>
  );
}

export function SwatchRow({
  selectedColor,
  onPick,
}: {
  selectedColor: string | null | undefined;
  onPick: (swatch: { color: string; textColor: string }) => void;
}) {
  return (
    <View style={ui.swatchRow}>
      {COLOR_SWATCHES.map(swatch => (
        <Pressable
          key={swatch.key}
          onPress={() => onPick({ color: swatch.color, textColor: swatch.textColor })}
          accessibilityRole="button"
          accessibilityLabel={`Colour ${swatch.key}`}
          style={[ui.swatch, { backgroundColor: swatch.color }, selectedColor?.toLowerCase() === swatch.color && ui.swatchSelected]}
        />
      ))}
    </View>
  );
}

/** The small uppercase heading above each block. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={ui.sectionLabel}>{children}</Text>;
}

/** The dashed "add one" panel at the foot of each table. */
export function AddPanel({ children }: { children: ReactNode }) {
  return <View style={ui.addPanel}>{children}</View>;
}

export function FieldCaption({ children }: { children: ReactNode }) {
  return <Text style={ui.fieldCaption}>{children}</Text>;
}

export function Pill({ text, bg = st.addedPillBg, color = st.addedPillText }: { text: string; bg?: string; color?: string }) {
  return (
    <View style={[ui.pill, { backgroundColor: bg }]}>
      <Text style={[ui.pillText, { color }]}>{text}</Text>
    </View>
  );
}

export function UnderlineTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly { key: string; label: string; disabled?: boolean }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={ui.tabs}>
      {tabs.map(tab =>
        tab.disabled ? null : (
          <Pressable key={tab.key} onPress={() => onSelect(tab.key)} accessibilityRole="tab" accessibilityState={{ selected: active === tab.key }} style={[ui.tab, active === tab.key && ui.tabActive]}>
            <Text style={[ui.tabText, active === tab.key && ui.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

/** Shared table styles: mock-up's quiet grid. */
export const tbl = StyleSheet.create({
  headRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: st.border },
  th: { fontSize: 12, fontWeight: '600', color: st.muted, paddingVertical: 8, paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: st.rowBorder },
  cell: { paddingVertical: 9, paddingHorizontal: 10, justifyContent: 'center' },
  mono: { fontSize: 12.5, color: st.faint, fontFamily: 'monospace' },
  body: { fontSize: 13.5, color: st.text },
  bodyMuted: { fontSize: 13.5, color: st.muted },
});

const ui = StyleSheet.create({
  input: {
    fontSize: 13.5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: st.inputBorder,
    borderRadius: 6,
    color: st.text,
    backgroundColor: '#ffffff',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: st.inputBorder,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  selectText: { fontSize: 13.5, color: st.text },
  selectChevron: { fontSize: 10, color: st.faint },
  btn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: st.primary },
  btnPrimaryHover: { backgroundColor: '#374151' },
  btnPrimaryText: { color: '#ffffff', fontSize: 13.5, fontWeight: '600' },
  btnOutline: { backgroundColor: '#ffffff', borderColor: st.inputBorder },
  btnOutlineHover: { backgroundColor: st.softBg },
  btnOutlineText: { color: '#374151', fontSize: 13.5, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  link: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4 },
  linkHover: { backgroundColor: '#fef2f2' },
  linkText: { color: st.danger, fontSize: 13, fontWeight: '600' },
  arrow: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  arrowHover: { backgroundColor: st.rowBorder },
  arrowText: { fontSize: 9, color: st.muted },
  swatchRow: { flexDirection: 'row', gap: 6 },
  swatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: st.primary },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: st.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  addPanel: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    padding: 14,
    backgroundColor: st.softBg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: st.inputBorder,
    borderRadius: 10,
  },
  fieldCaption: { fontSize: 11.5, color: st.muted, marginBottom: 4 },
  pill: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 10.5, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 22, paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: st.border },
  tab: { paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabActive: { borderBottomColor: st.primary },
  tabText: { fontSize: 13.5, fontWeight: '600', color: st.faint },
  tabTextActive: { color: st.text },
});
