import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Menu, Switch, Text, TextInput } from 'react-native-paper';
import { FormField, formTheme, inputStyle } from './FormDialog';
import { formatCustomValue, hasCustomValue, type CustomFieldDef, type CustomFieldValues } from '../constants/customFields';
import { themed } from '../constants/Colors';

// HT-52: the custom-fields block every form and detail page shares. Inputs
// render one control per definition in the organisation's order; the block
// disappears when there are no definitions, so nothing changes for an
// organisation that never opened Settings. HT-53 drops the same components
// into the job and invoice forms.

type InputsProps = {
  defs: readonly CustomFieldDef[];
  values: CustomFieldValues;
  errors?: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  /** Section heading above the inputs; omit inside a form that already groups them. */
  title?: string;
};

export function CustomFieldInputs({ defs, values, errors = {}, onChange, title = 'Custom fields' }: InputsProps) {
  if (defs.length === 0) return null;
  return (
    <View style={styles.block}>
      {title ? <Text style={styles.blockTitle}>{title}</Text> : null}
      {defs.map(def => (
        <FormField key={def.key} error={errors[def.key]}>
          <CustomFieldInput def={def} value={values[def.key]} error={!!errors[def.key]} onChange={value => onChange(def.key, value)} />
        </FormField>
      ))}
    </View>
  );
}

const labelFor = (def: CustomFieldDef) => (def.required ? `${def.label} *` : def.label);

function CustomFieldInput({
  def,
  value,
  error,
  onChange,
}: {
  def: CustomFieldDef;
  value: unknown;
  error: boolean;
  onChange: (value: unknown) => void;
}) {
  switch (def.type) {
    case 'boolean':
      return (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{labelFor(def)}</Text>
          <Switch value={value === true} onValueChange={onChange} accessibilityLabel={def.label} />
        </View>
      );
    case 'dropdown':
      return <DropdownInput def={def} value={typeof value === 'string' ? value : ''} error={error} onChange={onChange} />;
    case 'number':
      return (
        <TextInput
          mode="outlined"
          label={labelFor(def)}
          value={value === null || value === undefined ? '' : String(value)}
          onChangeText={onChange}
          keyboardType="numeric"
          error={error}
          style={inputStyle}
        />
      );
    case 'date':
      return (
        <TextInput
          mode="outlined"
          label={labelFor(def)}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          error={error}
          style={inputStyle}
        />
      );
    case 'long_text':
      return (
        <TextInput
          mode="outlined"
          label={labelFor(def)}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          multiline
          numberOfLines={3}
          error={error}
          style={inputStyle}
        />
      );
    default:
      return (
        <TextInput
          mode="outlined"
          label={labelFor(def)}
          value={value === null || value === undefined ? '' : String(value)}
          onChangeText={onChange}
          error={error}
          style={inputStyle}
        />
      );
  }
}

// A Paper Menu behind an outlined button, so it works on web and native
// alike. A stored value that is no longer among the options still shows,
// and stays, until the user picks something else (HT-52 step 4).
function DropdownInput({
  def,
  value,
  error,
  onChange,
}: {
  def: CustomFieldDef;
  value: string;
  error: boolean;
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = def.options ?? [];
  const stale = value !== '' && !options.includes(value);
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Button
          mode="outlined"
          onPress={() => setOpen(true)}
          icon="menu-down"
          contentStyle={styles.dropdownContent}
          style={[styles.dropdown, error && styles.dropdownError]}
          labelStyle={styles.dropdownLabel}
          accessibilityLabel={def.label}
        >
          {value ? `${labelFor(def)}: ${value}${stale ? ' (no longer an option)' : ''}` : labelFor(def)}
        </Button>
      }
    >
      <Menu.Item title="—" onPress={() => { onChange(''); setOpen(false); }} />
      {options.map(option => (
        <Menu.Item key={option} title={option} onPress={() => { onChange(option); setOpen(false); }} />
      ))}
    </Menu>
  );
}

/** The read-only block for a detail page. Renders nothing without definitions. */
export function CustomFieldsView({ defs, values, title = 'Custom fields' }: { defs: readonly CustomFieldDef[]; values: CustomFieldValues | null | undefined; title?: string }) {
  if (defs.length === 0) return null;
  const record = values ?? {};
  return (
    <View style={styles.block}>
      {title ? <Text style={styles.blockTitle}>{title}</Text> : null}
      {defs.map(def => (
        <View key={def.key} style={styles.viewRow}>
          <Text style={styles.viewLabel}>{def.label}</Text>
          <Text style={[styles.viewValue, !hasCustomValue(def, record[def.key]) && styles.viewEmpty]}>
            {formatCustomValue(def, record[def.key]) || '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 8 },
  blockTitle: { fontSize: 13, fontWeight: '600', color: formTheme.mutedText, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  switchLabel: { fontSize: 16, color: formTheme.text },
  dropdown: { justifyContent: 'flex-start', borderColor: '#79747E', borderRadius: 4, backgroundColor: formTheme.background },
  dropdownError: { borderColor: '#B3261E' },
  dropdownContent: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  dropdownLabel: { color: formTheme.text, fontSize: 16, textAlign: 'left', flex: 1 },
  viewRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: formTheme.border },
  viewLabel: { width: 160, color: formTheme.mutedText },
  viewValue: { flex: 1, color: formTheme.text },
  viewEmpty: { color: themed.faint },
});
