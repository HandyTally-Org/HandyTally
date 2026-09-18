import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Dialog, Portal, Snackbar } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  generateFieldKey,
  parseOptions,
  type CustomFieldDef,
  type CustomFieldSection,
  type CustomFieldType,
} from '../../constants/customFields';
import {
  AddPanel,
  ArrowButton,
  FieldCaption,
  LinkButton,
  OutlineButton,
  Pill,
  PrimaryButton,
  SectionLabel,
  SelectMenu,
  SettingsInput,
  st,
  tbl,
} from './ui';

// HT-52: the Fields tab of a section in Admin > Settings, to the approved
// HT-45 mock-up: the section's built-in fields as quiet pills, the custom
// definitions as a table (label with its generated key, type with inline
// dropdown options, required, order, remove), a dashed add-panel, and a live
// preview of the section's form. Keys are generated from the label and
// frozen once saved — records carry values under them. Deleting a definition
// hides the field and keeps stored values unless the admin explicitly
// deletes the data too.

const BASE_FORM_FIELDS: Record<string, string[]> = {
  clients: ['Name', 'Email', 'Phone', 'Address', 'Notes'],
  materials: ['SKU', 'Name', 'Description', 'Quantity', 'Cost', 'Supplier', 'Category'],
  services: ['Name', 'Description', 'Rate', 'Category'],
  jobs: ['Title', 'Description', 'Client', 'Status', 'Dates', 'Assigned to'],
  invoices: ['Invoice #', 'Client', 'Job', 'Status', 'Dates', 'Line items'],
};

const TYPE_OPTIONS = CUSTOM_FIELD_TYPES.map(type => ({ value: type, label: CUSTOM_FIELD_TYPE_LABELS[type] }));

type Draft = CustomFieldDef & {
  /** Text of the options editor, kept as typed until save. */
  optionsText: string;
  /** True for a row added since the last save; its key can still change with the label. */
  isNew?: boolean;
};

const toDraft = (def: CustomFieldDef): Draft => ({ ...def, optionsText: (def.options ?? []).join(', ') });
const toDef = (draft: Draft): CustomFieldDef => ({
  key: draft.key,
  label: draft.label.trim() || draft.key,
  type: draft.type,
  required: draft.required,
  ...(draft.type === 'dropdown' ? { options: parseOptions(draft.optionsText) } : {}),
});

function CheckBox({ checked, onToggle, accessibilityLabel }: { checked: boolean; onToggle: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.check, checked && styles.checkOn]}
    >
      {checked ? <Text style={styles.checkMark}>✓</Text> : null}
    </Pressable>
  );
}

export function CustomFieldsEditor({ section, sectionLabel }: { section: CustomFieldSection; sectionLabel: string }) {
  const { organization, settings, settingsLoaded, refreshSettings } = useAuth();
  const saved = settings.customFields[section] ?? [];

  const [rows, setRows] = useState<Draft[]>(() => saved.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null);

  // Add panel.
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>('text');
  const [newRequired, setNewRequired] = useState(false);
  const [newOptions, setNewOptions] = useState('');

  const draftDefs = useMemo(() => rows.map(toDef), [rows]);
  const dirty = JSON.stringify(draftDefs) !== JSON.stringify(saved);

  // Follow the saved definitions when they (re)load or the section changes, unless mid-edit.
  useEffect(() => {
    if (!settingsLoaded || dirty) return;
    setRows(saved.map(toDraft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, section, settings.customFields]);

  const update = (key: string, patch: Partial<Draft>) =>
    setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)));

  const move = (key: string, direction: -1 | 1) =>
    setRows(current => {
      const index = current.findIndex(row => row.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = generateFieldKey(label, rows.map(row => row.key));
    setRows(current => [
      ...current,
      { key, label, type: newType, required: newRequired, optionsText: newType === 'dropdown' ? newOptions : '', isNew: true },
    ]);
    setNewLabel('');
    setNewType('text');
    setNewRequired(false);
    setNewOptions('');
  };

  const persist = async (defs: CustomFieldDef[]) => {
    if (!organization) return;
    const { error } = await supabase
      .from('organization_settings')
      .upsert(
        {
          organization_id: organization.id,
          custom_fields: { ...settings.customFields, [section]: defs },
          updated_at: new Date().toISOString(),
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        },
        { onConflict: 'organization_id' },
      )
      .select('organization_id');
    if (error) throw error;
    await refreshSettings();
  };

  const save = async () => {
    try {
      setSaving(true);
      await persist(draftDefs);
      setSnackbar('Fields saved');
    } catch (error: any) {
      console.error('Error saving custom fields:', error);
      setSnackbar(`Could not save: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setSaving(false);
    }
  };

  // Delete: the definition goes now (saved immediately, so the "and its data"
  // choice acts on a consistent state); the values stay unless asked.
  const remove = async (row: Draft, purgeData: boolean) => {
    setPendingDelete(null);
    try {
      setSaving(true);
      const remaining = rows.filter(r => r.key !== row.key);
      await persist(remaining.map(toDef));
      // The sync effect only re-reads saved defs while the draft is clean, and
      // a delete alone would otherwise leave the stale row in local state
      // (blocking that sync, and letting a re-add generate a _2 key). Drop it
      // from the draft immediately instead of waiting on refreshSettings.
      setRows(remaining);
      if (purgeData && organization) {
        const { data, error } = await supabase.rpc('purge_custom_field_values', {
          p_organization_id: organization.id,
          p_section: section,
          p_key: row.key,
        });
        if (error) throw error;
        setSnackbar(`Removed "${row.label}" and its data from ${data ?? 0} record${data === 1 ? '' : 's'}`);
      } else {
        setSnackbar(`Removed "${row.label}"; stored values are kept and reappear if a field with key "${row.key}" is added again`);
      }
    } catch (error: any) {
      console.error('Error deleting custom field:', error);
      setSnackbar(`Could not delete: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const baseFields = BASE_FORM_FIELDS[section] ?? [];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Existing fields</SectionLabel>
        <View style={styles.basePills}>
          {baseFields.map(name => (
            <View key={name} style={styles.basePill}>
              <Text style={styles.basePillText}>{name}</Text>
            </View>
          ))}
        </View>

        <SectionLabel>Custom fields</SectionLabel>

        {rows.length === 0 ? (
          <Text style={styles.empty}>No custom fields yet — add one below.</Text>
        ) : (
          <View style={styles.table}>
            <View style={tbl.headRow}>
              <Text style={[tbl.th, styles.colLabel]}>Label</Text>
              <Text style={[tbl.th, styles.colType]}>Type</Text>
              <Text style={[tbl.th, styles.colRequired]}>Required</Text>
              <Text style={[tbl.th, styles.colOrder]}>Order</Text>
              <View style={styles.colRemove} />
            </View>
            {rows.map((row, index) => (
              <View key={row.key} style={[tbl.row, styles.rowTop]}>
                <View style={[tbl.cell, styles.colLabel]}>
                  <SettingsInput
                    value={row.label}
                    onChangeText={label =>
                      update(row.key, {
                        label,
                        // A row not yet saved follows its label; a saved key is frozen.
                        ...(row.isNew ? { key: generateFieldKey(label, rows.filter(r => r.key !== row.key).map(r => r.key)) } : {}),
                      })
                    }
                    accessibilityLabel={`Label of ${row.label}`}
                  />
                  <Text style={styles.keyText} numberOfLines={1}>{row.key}</Text>
                </View>
                <View style={[tbl.cell, styles.colType]}>
                  <SelectMenu
                    value={row.type}
                    options={TYPE_OPTIONS}
                    onChange={type => update(row.key, { type: type as CustomFieldType })}
                    accessibilityLabel={`Type of ${row.label}`}
                  />
                  {row.type === 'dropdown' ? (
                    <View style={styles.optionsWrap}>
                      <FieldCaption>Options, comma-separated</FieldCaption>
                      <SettingsInput
                        value={row.optionsText}
                        onChangeText={optionsText => update(row.key, { optionsText })}
                        placeholder="e.g. Residential, Commercial"
                        accessibilityLabel={`Options for ${row.label}`}
                      />
                    </View>
                  ) : null}
                </View>
                <View style={[tbl.cell, styles.colRequired]}>
                  <CheckBox
                    checked={row.required}
                    onToggle={() => update(row.key, { required: !row.required })}
                    accessibilityLabel={`${row.label} required`}
                  />
                </View>
                <View style={[tbl.cell, styles.colOrder, styles.orderCell]}>
                  <ArrowButton dir="up" onPress={() => move(row.key, -1)} disabled={index === 0} accessibilityLabel={`Move ${row.label} up`} />
                  <ArrowButton dir="down" onPress={() => move(row.key, 1)} disabled={index === rows.length - 1} accessibilityLabel={`Move ${row.label} down`} />
                </View>
                <View style={[tbl.cell, styles.colRemove, styles.right]}>
                  <LinkButton
                    label="Remove"
                    onPress={() => (row.isNew ? setRows(current => current.filter(r => r.key !== row.key)) : setPendingDelete(row))}
                    accessibilityLabel={`Delete ${row.label}`}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.addWrap}>
          <AddPanel>
            <View style={styles.addLabel}>
              <FieldCaption>Field label</FieldCaption>
              <SettingsInput value={newLabel} onChangeText={setNewLabel} placeholder="e.g. Gate code" accessibilityLabel="New field label" />
            </View>
            <View style={styles.addType}>
              <FieldCaption>Type</FieldCaption>
              <SelectMenu value={newType} options={TYPE_OPTIONS} onChange={type => setNewType(type as CustomFieldType)} accessibilityLabel="New field type" />
            </View>
            <Pressable onPress={() => setNewRequired(v => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: newRequired }} style={styles.addRequired}>
              <CheckBox checked={newRequired} onToggle={() => setNewRequired(v => !v)} accessibilityLabel="New field required" />
              <Text style={styles.addRequiredText}>Required</Text>
            </Pressable>
            <PrimaryButton label="+ Add field" onPress={add} disabled={!newLabel.trim()} />
            {newType === 'dropdown' ? (
              <View style={styles.addOptions}>
                <FieldCaption>Dropdown options, comma-separated</FieldCaption>
                <SettingsInput
                  value={newOptions}
                  onChangeText={setNewOptions}
                  placeholder="e.g. Residential, Commercial, Service call"
                  accessibilityLabel="New field options"
                />
              </View>
            ) : null}
          </AddPanel>
        </View>

        <SectionLabel>Live preview — {sectionLabel} form</SectionLabel>
        <View style={styles.preview}>
          {baseFields.map(name => (
            <View key={name} style={styles.previewRow}>
              <Text style={styles.previewBaseLabel}>{name}</Text>
              <View style={styles.previewBaseInput} />
            </View>
          ))}
          {draftDefs.map(def => (
            <View key={def.key} style={styles.previewRow}>
              <Text style={styles.previewCustomLabel}>{def.label}</Text>
              {def.type === 'dropdown' ? (
                <View style={[styles.previewCustomInput, styles.previewDropdown]}>
                  <Text style={styles.previewDropdownText} numberOfLines={1}>{(def.options ?? []).join(' / ') || 'Options…'}</Text>
                  <Text style={styles.previewChevron}>▾</Text>
                </View>
              ) : (
                <View style={styles.previewCustomInput} />
              )}
              <Pill text="Custom" />
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <PrimaryButton label={saving ? 'Saving…' : 'Save fields'} onPress={save} disabled={saving || !dirty} />
          <OutlineButton label="Discard changes" onPress={() => setRows(saved.map(toDraft))} disabled={saving || !dirty} />
          {dirty ? <Text style={styles.unsaved}>Unsaved changes</Text> : null}
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={pendingDelete !== null} onDismiss={() => setPendingDelete(null)}>
          <Dialog.Title>Delete "{pendingDelete?.label}"?</Dialog.Title>
          <Dialog.Content>
            <Text style={tbl.body}>
              The field disappears from the {sectionLabel} forms. Values already entered stay on the records and come back
              if a field with the key "{pendingDelete?.key}" is added again — unless you delete the data too.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPendingDelete(null)}>Cancel</Button>
            <Button onPress={() => pendingDelete && remove(pendingDelete, false)}>Delete field</Button>
            <Button textColor={st.danger} onPress={() => pendingDelete && remove(pendingDelete, true)}>
              Delete field and its data
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 22 },
  basePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  basePill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: st.rowBorder,
    borderWidth: 1,
    borderColor: st.border,
  },
  basePillText: { fontSize: 12.5, color: '#4b5563' },
  empty: { fontSize: 13.5, color: st.faint, marginBottom: 14 },
  table: { marginBottom: 4 },
  rowTop: { alignItems: 'flex-start' },
  colLabel: { flex: 3, minWidth: 160 },
  colType: { flex: 2.6, minWidth: 150 },
  colRequired: { width: 80, alignItems: 'center' },
  colOrder: { width: 84 },
  colRemove: { width: 84 },
  right: { alignItems: 'flex-end' },
  orderCell: { flexDirection: 'row', gap: 4 },
  keyText: { fontSize: 11, color: st.faint, fontFamily: 'monospace', marginTop: 3 },
  optionsWrap: { marginTop: 8 },
  addWrap: { marginTop: 14, marginBottom: 26 },
  addLabel: { flexGrow: 1, minWidth: 180 },
  addType: { minWidth: 150 },
  addRequired: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 9 },
  addRequiredText: { fontSize: 13, color: '#374151' },
  addOptions: { flexBasis: '100%', minWidth: 0 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: st.inputBorder,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: st.primary, borderColor: st.primary },
  checkMark: { color: '#ffffff', fontSize: 12, lineHeight: 14, fontWeight: '700' },
  preview: { borderWidth: 1, borderColor: st.border, borderRadius: 10, padding: 16, backgroundColor: '#fafafa' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  previewBaseLabel: { width: 150, fontSize: 13, color: st.muted },
  previewBaseInput: { flex: 1, height: 30, borderRadius: 6, backgroundColor: st.rowBorder },
  previewCustomLabel: { width: 150, fontSize: 13, color: st.text, fontWeight: '600' },
  previewCustomInput: { flex: 1, height: 30, borderRadius: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: st.primary },
  previewDropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  previewDropdownText: { fontSize: 13, color: '#374151', flexShrink: 1 },
  previewChevron: { fontSize: 10, color: st.faint },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  unsaved: { color: '#b45309', fontSize: 13 },
});
