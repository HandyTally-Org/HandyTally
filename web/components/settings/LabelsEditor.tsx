import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  BUILT_IN_LABELS,
  mergeLabels,
  type LabelDef,
  type LabelOverride,
  type LabelSection,
} from '../../constants/labels';
import { generateFieldKey } from '../../constants/customFields';
import { LabelPill } from '../LabelPill';
import {
  AddPanel,
  FieldCaption,
  LinkButton,
  OutlineButton,
  Pill,
  PrimaryButton,
  SectionLabel,
  SettingsInput,
  SwatchRow,
  st,
  tbl,
} from './ui';

// HT-51: the Labels tab of a section in Admin > Settings, to the approved
// HT-45 mock-up. One row per value the section can carry — the stored value
// (monospace, never editable), the built-in name, the organisation's name
// and a six-swatch colour — plus an add-panel that turns "On hold" into
// on_hold. Built-ins can be renamed and recoloured but never removed; an
// added value can be removed only while no record uses it. Saving writes the
// section's overrides into organization_settings.labels, and every picker,
// chip, filter and calendar colour reads the merged list through useLabels.

const SECTION_RECORDS: Record<LabelSection, { table: string; column: string; thing: string }> = {
  job_status: { table: 'jobs', column: 'status', thing: 'status' },
  invoice_status: { table: 'invoices', column: 'status', thing: 'status' },
  client_tag: { table: 'clients', column: 'tag', thing: 'tag' },
};

function toOverrides(section: LabelSection, rows: readonly LabelDef[]): LabelOverride[] {
  const overrides: LabelOverride[] = [];
  for (const row of rows) {
    const base = BUILT_IN_LABELS[section].find(def => def.value === row.value);
    if (base) {
      const o: LabelOverride = { value: row.value };
      if (row.label !== base.label) o.label = row.label;
      if (row.color !== base.color) o.color = row.color;
      if (row.textColor !== base.textColor) o.textColor = row.textColor;
      if (o.label !== undefined || o.color !== undefined || o.textColor !== undefined) overrides.push(o);
    } else {
      overrides.push({ value: row.value, label: row.label, color: row.color, textColor: row.textColor });
    }
  }
  return overrides;
}

export function LabelsEditor({ section, sectionLabel }: { section: LabelSection; sectionLabel: string }) {
  const { organization, settings, settingsLoaded, refreshSettings } = useAuth();
  const records = SECTION_RECORDS[section];
  const saved = useMemo(() => mergeLabels(section, settings.labels), [section, settings.labels]);

  const [rows, setRows] = useState<LabelDef[]>(() => [...saved]);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<{ color: string; textColor: string } | null>(null);

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);

  // Follow the saved labels when they (re)load or the section changes, unless mid-edit.
  useEffect(() => {
    if (!settingsLoaded || dirty) return;
    setRows([...saved]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, section, saved]);

  const update = (value: string, patch: Partial<LabelDef>) =>
    setRows(current => current.map(row => (row.value === value ? { ...row, ...patch } : row)));

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = generateFieldKey(label, rows.map(row => row.value));
    const colour = newColor ?? { color: '#e5e7eb', textColor: '#374151' };
    setRows(current => [...current, { value, label, ...colour }]);
    setNewLabel('');
    setNewColor(null);
  };

  // An added value leaves the draft only while nothing stores it.
  const remove = async (row: LabelDef) => {
    try {
      const { count, error } = await supabase
        .from(records.table)
        .select('uid', { count: 'exact', head: true })
        .eq(records.column, row.value);
      if (error) throw error;
      if ((count ?? 0) > 0) {
        setSnackbar(`"${row.label}" is used by ${count} record${count === 1 ? '' : 's'} — change those first`);
        return;
      }
      setRows(current => current.filter(r => r.value !== row.value));
    } catch (error: any) {
      console.error('Error checking label use:', error);
      setSnackbar(`Could not check whether "${row.label}" is in use: ${error?.message || JSON.stringify(error)}`);
    }
  };

  const save = async () => {
    if (!organization) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('organization_settings')
        .upsert(
          {
            organization_id: organization.id,
            labels: { ...settings.labels, [section]: toOverrides(section, rows) },
            updated_at: new Date().toISOString(),
            updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          },
          { onConflict: 'organization_id' },
        )
        .select('organization_id');
      if (error) throw error;
      await refreshSettings();
      setSnackbar('Labels saved');
    } catch (error: any) {
      console.error('Error saving labels:', error);
      setSnackbar(`Could not save: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Values shown on {sectionLabel}</SectionLabel>

        <View style={tbl.headRow}>
          <Text style={[tbl.th, styles.colValue]}>Stored value</Text>
          <Text style={[tbl.th, styles.colDefault]}>Default label</Text>
          <Text style={[tbl.th, styles.colYours]}>Your label</Text>
          <Text style={[tbl.th, styles.colColour]}>Colour</Text>
          <View style={styles.colRemove} />
        </View>

        {rows.map(row => {
          const base = BUILT_IN_LABELS[section].find(def => def.value === row.value);
          return (
            <View key={row.value} style={tbl.row}>
              <View style={[tbl.cell, styles.colValue]}>
                <Text style={tbl.mono} numberOfLines={1}>{row.value}</Text>
              </View>
              <View style={[tbl.cell, styles.colDefault]}>
                {base ? <Text style={tbl.bodyMuted}>{base.label}</Text> : <Pill text="Added by you" />}
              </View>
              <View style={[tbl.cell, styles.colYours]}>
                <SettingsInput
                  value={row.label}
                  onChangeText={label => update(row.value, { label })}
                  accessibilityLabel={`Label for ${row.value}`}
                  style={styles.labelInput}
                />
              </View>
              <View style={[tbl.cell, styles.colColour]}>
                <SwatchRow selectedColor={row.color} onPick={colour => update(row.value, colour)} />
              </View>
              <View style={[tbl.cell, styles.colRemove, styles.right]}>
                {!base ? <LinkButton label="Remove" onPress={() => remove(row)} accessibilityLabel={`Remove ${row.label}`} /> : null}
              </View>
            </View>
          );
        })}

        <View style={styles.addWrap}>
          <AddPanel>
            <View style={styles.addLabel}>
              <FieldCaption>New label</FieldCaption>
              <SettingsInput value={newLabel} onChangeText={setNewLabel} placeholder="e.g. On hold" accessibilityLabel="New label" />
            </View>
            <View>
              <FieldCaption>Colour</FieldCaption>
              <View style={styles.addSwatches}>
                <SwatchRow selectedColor={newColor?.color} onPick={setNewColor} />
              </View>
            </View>
            <PrimaryButton label="+ Add label" onPress={add} disabled={!newLabel.trim()} />
            <Text style={styles.addHint}>
              A label you add gets a stored value made from its name (On hold → on_hold) and appears in every {sectionLabel}{' '}
              {records.thing} picker and filter. Built-in values can be renamed but not removed.
            </Text>
          </AddPanel>
        </View>

        <SectionLabel>Live preview — {sectionLabel} {records.thing} chips</SectionLabel>
        <View style={styles.preview}>
          {rows.map(row => (
            <LabelPill key={row.value} label={row.label} color={row.color} textColor={row.textColor} />
          ))}
        </View>

        <View style={styles.footer}>
          <PrimaryButton label={saving ? 'Saving…' : 'Save labels'} onPress={save} disabled={saving || !dirty} />
          <OutlineButton label="Discard changes" onPress={() => setRows([...saved])} disabled={saving || !dirty} />
          {dirty ? <Text style={styles.unsaved}>Unsaved changes</Text> : null}
        </View>
      </ScrollView>

      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 22 },
  colValue: { flex: 2, minWidth: 90 },
  colDefault: { flex: 2, minWidth: 100 },
  colYours: { flex: 3, minWidth: 150 },
  colColour: { width: 188 },
  colRemove: { width: 84 },
  right: { alignItems: 'flex-end' },
  labelInput: { maxWidth: 200 },
  addWrap: { marginTop: 14, marginBottom: 24 },
  addLabel: { flexGrow: 1, minWidth: 180 },
  addSwatches: { paddingVertical: 5 },
  addHint: { flexBasis: '100%', fontSize: 11.5, color: st.faint },
  preview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: st.border,
    borderRadius: 10,
    backgroundColor: '#fafafa',
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  unsaved: { color: '#b45309', fontSize: 13 },
});
