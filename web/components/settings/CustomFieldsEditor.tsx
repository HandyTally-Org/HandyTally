import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Dialog, IconButton, Menu, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
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

// HT-52: the Fields tab of a section in Admin > Settings. A table of the
// section's custom field definitions — Label, Key, Type, Required, Order,
// Actions — plus an add row. Keys are generated from the label and read-only
// once saved: records already carry values under them. Saving writes the
// whole section back into organization_settings.custom_fields; deleting a
// definition hides the field and keeps stored values unless the admin
// explicitly deletes the data too.

type Props = {
  section: CustomFieldSection;
  sectionLabel: string;
};

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

export function CustomFieldsEditor({ section, sectionLabel }: Props) {
  const { organization, settings, settingsLoaded, refreshSettings } = useAuth();
  const saved = settings.customFields[section] ?? [];

  const [rows, setRows] = useState<Draft[]>(() => saved.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null);

  // Add row.
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
    if (!organization) return false;
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
    return true;
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
      const remaining = rows.filter(r => r.key !== row.key).map(toDef);
      await persist(remaining);
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

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Fields defined here appear on every {sectionLabel} add/edit form and detail page in the organisation.
          The key is generated from the label and cannot change once saved.
        </Text>

        <View style={styles.headerRow}>
          <Text style={[styles.cell, styles.cellLabel, styles.headerText]}>Label</Text>
          <Text style={[styles.cell, styles.cellKey, styles.headerText]}>Key</Text>
          <Text style={[styles.cell, styles.cellType, styles.headerText]}>Type</Text>
          <Text style={[styles.cell, styles.cellRequired, styles.headerText]}>Required</Text>
          <Text style={[styles.cell, styles.cellActions, styles.headerText]}>Order / actions</Text>
        </View>

        {rows.length === 0 ? <Text style={styles.empty}>No custom fields yet. Add one below.</Text> : null}

        {rows.map((row, index) => (
          <View key={row.key} style={styles.rowBlock}>
            <View style={styles.row}>
              <View style={[styles.cell, styles.cellLabel]}>
                <TextInput
                  mode="outlined"
                  dense
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
              </View>
              <Text style={[styles.cell, styles.cellKey, styles.keyText]} numberOfLines={1}>{row.key}</Text>
              <View style={[styles.cell, styles.cellType]}>
                <TypeMenu value={row.type} onChange={type => update(row.key, { type })} label={`Type of ${row.label}`} />
              </View>
              <View style={[styles.cell, styles.cellRequired]}>
                <Checkbox
                  status={row.required ? 'checked' : 'unchecked'}
                  onPress={() => update(row.key, { required: !row.required })}
                />
              </View>
              <View style={[styles.cell, styles.cellActions, styles.actions]}>
                <IconButton icon="chevron-up" size={18} disabled={index === 0} onPress={() => move(row.key, -1)} accessibilityLabel={`Move ${row.label} up`} />
                <IconButton icon="chevron-down" size={18} disabled={index === rows.length - 1} onPress={() => move(row.key, 1)} accessibilityLabel={`Move ${row.label} down`} />
                <IconButton icon="delete-outline" size={18} onPress={() => (row.isNew ? setRows(current => current.filter(r => r.key !== row.key)) : setPendingDelete(row))} accessibilityLabel={`Delete ${row.label}`} />
              </View>
            </View>
            {row.type === 'dropdown' ? (
              <View style={styles.optionsRow}>
                <TextInput
                  mode="outlined"
                  dense
                  label="Options (comma-separated)"
                  value={row.optionsText}
                  onChangeText={optionsText => update(row.key, { optionsText })}
                  accessibilityLabel={`Options of ${row.label}`}
                />
              </View>
            ) : null}
          </View>
        ))}

        <Text style={styles.addTitle}>Add a field</Text>
        <View style={styles.row}>
          <View style={[styles.cell, styles.cellLabel]}>
            <TextInput mode="outlined" dense label="Label" value={newLabel} onChangeText={setNewLabel} accessibilityLabel="New field label" />
          </View>
          <Text style={[styles.cell, styles.cellKey, styles.keyText]} numberOfLines={1}>
            {newLabel.trim() ? generateFieldKey(newLabel, rows.map(r => r.key)) : ''}
          </Text>
          <View style={[styles.cell, styles.cellType]}>
            <TypeMenu value={newType} onChange={setNewType} label="New field type" />
          </View>
          <View style={[styles.cell, styles.cellRequired]}>
            <Checkbox status={newRequired ? 'checked' : 'unchecked'} onPress={() => setNewRequired(v => !v)} />
          </View>
          <View style={[styles.cell, styles.cellActions, styles.actions]}>
            <Button mode="contained-tonal" compact onPress={add} disabled={!newLabel.trim()}>
              Add
            </Button>
          </View>
        </View>
        {newType === 'dropdown' ? (
          <View style={styles.optionsRow}>
            <TextInput mode="outlined" dense label="Options (comma-separated)" value={newOptions} onChangeText={setNewOptions} accessibilityLabel="New field options" />
          </View>
        ) : null}

        <View style={styles.footer}>
          <Button mode="contained" onPress={save} loading={saving} disabled={saving || !dirty}>
            Save fields
          </Button>
          <Button mode="outlined" onPress={() => setRows(saved.map(toDraft))} disabled={saving || !dirty}>
            Discard changes
          </Button>
          {dirty ? <Text style={styles.unsaved}>Unsaved changes</Text> : null}
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={pendingDelete !== null} onDismiss={() => setPendingDelete(null)}>
          <Dialog.Title>Delete "{pendingDelete?.label}"?</Dialog.Title>
          <Dialog.Content>
            <Text>
              The field disappears from the {sectionLabel} forms. Values already entered stay on the records and come back
              if a field with the key "{pendingDelete?.key}" is added again — unless you delete the data too.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPendingDelete(null)}>Cancel</Button>
            <Button onPress={() => pendingDelete && remove(pendingDelete, false)}>Delete field</Button>
            <Button textColor="#B3261E" onPress={() => pendingDelete && remove(pendingDelete, true)}>
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

function TypeMenu({ value, onChange, label }: { value: CustomFieldType; onChange: (type: CustomFieldType) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Button mode="outlined" compact onPress={() => setOpen(true)} icon="menu-down" contentStyle={{ flexDirection: 'row-reverse' }} accessibilityLabel={label}>
          {CUSTOM_FIELD_TYPE_LABELS[value]}
        </Button>
      }
    >
      {CUSTOM_FIELD_TYPES.map(type => (
        <Menu.Item key={type} title={CUSTOM_FIELD_TYPE_LABELS[type]} onPress={() => { onChange(type); setOpen(false); }} />
      ))}
    </Menu>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },
  hint: { color: '#666', marginBottom: 12 },
  headerRow: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', marginBottom: 4 },
  headerText: { fontSize: 12, fontWeight: '600', color: '#666', textTransform: 'uppercase' },
  rowBlock: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  cell: { justifyContent: 'center' },
  cellLabel: { flex: 3, minWidth: 140 },
  cellKey: { flex: 2, minWidth: 100 },
  cellType: { flex: 2, minWidth: 130 },
  cellRequired: { width: 72, alignItems: 'center' },
  cellActions: { width: 150 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  keyText: { fontFamily: 'monospace', color: '#555', fontSize: 13 },
  optionsRow: { paddingLeft: 8, paddingBottom: 8 },
  empty: { color: '#999', paddingVertical: 12 },
  addTitle: { marginTop: 20, marginBottom: 4, fontWeight: '600', color: '#333' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  unsaved: { color: '#b45309' },
});
