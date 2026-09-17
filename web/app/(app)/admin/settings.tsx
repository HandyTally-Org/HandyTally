import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, IconButton, SegmentedButtons, Snackbar, Switch, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { TwoPane } from '../../../components/TwoPane';
import { NAV_ITEMS, type NavItem } from '../../../constants/navigation';
import { DEFAULT_NAV_SETTINGS, editableNavOrder, toNavSettings, type NavSettings } from '../../../constants/organizationSettings';
import { NAV_KEY_TO_SECTION } from '../../../constants/customFields';
import { CustomFieldsEditor } from '../../../components/settings/CustomFieldsEditor';

// HT-50: Admin > Settings. Left: the sidebar entries in the organisation's
// order, each with a drag handle (web), up/down buttons, a visibility switch
// and, for sections that hold records, a gear that opens the right pane.
// Right: that section's Fields and Labels tabs — the tabs are the slots
// HT-51 (Labels) and HT-52 / HT-53 (Fields) fill in. Saving is explicit:
// Save writes the organization_settings row, Reset to defaults puts the
// editor back to the built-in order without saving.

/** Sections that have records of their own, and so a gear. */
const SECTIONS_WITH_FIELDS = new Set(Object.keys(NAV_KEY_TO_SECTION));
/** Sections whose records carry a custom_fields column today (HT-52); jobs and invoices follow with HT-53. */
const SECTIONS_WITH_FIELD_STORAGE = new Set(['clients', 'inventory', 'labor']);
/** Sections with status or tag values a Labels tab can rename (HT-49 sections). */
const SECTIONS_WITH_LABELS = new Set(['clients', 'jobs', 'invoices']);

type PaneTab = 'fields' | 'labels';

export default function SettingsScreen() {
  const allowed = useRequireAdmin();
  const { organization, settings, settingsLoaded, refreshSettings } = useAuth();

  // Editor state: every unpinned entry in order, then the pinned ones.
  const [ordered, setOrdered] = useState<NavItem[]>(() => editableNavOrder(NAV_ITEMS, settings.nav));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(settings.nav.hidden));
  const [savedNav, setSavedNav] = useState<NavSettings>(settings.nav);
  const [selected, setSelected] = useState<NavItem | null>(null);
  const [tab, setTab] = useState<PaneTab>('fields');
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Take the saved settings whenever they (re)load, unless the admin is mid-edit.
  const draft = useMemo(() => toNavSettings(ordered, hidden), [ordered, hidden]);
  // Compare against what the saved settings resolve to, so an empty saved
  // order (the defaults) does not count as a change.
  const savedDraft = useMemo(
    () => toNavSettings(editableNavOrder(NAV_ITEMS, savedNav), new Set(savedNav.hidden)),
    [savedNav],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  useEffect(() => {
    if (!settingsLoaded || dirty) return;
    setOrdered(editableNavOrder(NAV_ITEMS, settings.nav));
    setHidden(new Set(settings.nav.hidden));
    setSavedNav(settings.nav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, settings.nav]);

  useRefreshOnFocus(() => {
    if (!dirty) refreshSettings();
  });

  // Unsaved changes: warn before the tab closes or reloads (web-only editor).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const move = useCallback((key: string, direction: -1 | 1) => {
    setOrdered(current => {
      const index = current.findIndex(item => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      if (current[index].pinned || current[target].pinned) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const dropOn = useCallback((targetKey: string) => {
    setOrdered(current => {
      if (!dragKey || dragKey === targetKey) return current;
      const from = current.findIndex(item => item.key === dragKey);
      const to = current.findIndex(item => item.key === targetKey);
      if (from < 0 || to < 0 || current[from].pinned || current[to].pinned) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragKey(null);
  }, [dragKey]);

  const toggleHidden = (key: string, visible: boolean) => {
    setHidden(current => {
      const next = new Set(current);
      if (visible) next.delete(key);
      else next.add(key);
      return next;
    });
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
            nav: draft,
            updated_at: new Date().toISOString(),
            updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          },
          { onConflict: 'organization_id' },
        )
        // Ask for the row back: PostgREST answers a failed minimal-return
        // upsert with an empty body, which would hide the reason.
        .select('organization_id');
      if (error) throw error;
      setSavedNav(draft);
      await refreshSettings();
      setSnackbar('Settings saved');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      const reason = error?.message || error?.details || error?.hint || (typeof error === 'string' ? error : JSON.stringify(error));
      setSnackbar(`Could not save: ${reason}`);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setOrdered(editableNavOrder(NAV_ITEMS, DEFAULT_NAV_SETTINGS));
    setHidden(new Set());
  };

  if (!allowed) return null;

  const list = (
    <ScrollView contentContainerStyle={styles.listContent}>
      <Text variant="titleMedium" style={styles.paneTitle}>Navigation</Text>
      <Text style={styles.hint}>
        Drag rows, or use the arrows, to set the sidebar order for everyone in {organization?.name ?? 'the company'}.
        Switch an entry off to hide it. Admin always stays last.
      </Text>
      {ordered.map((item, index) => {
        const visible = !hidden.has(item.key);
        const canMoveUp = index > 0 && !item.pinned;
        const canMoveDown = index < ordered.length - 1 && !ordered[index + 1].pinned && !item.pinned;
        const row = (
          <View
            style={[
              styles.row,
              selected?.key === item.key && styles.rowSelected,
              dragKey === item.key && styles.rowDragging,
            ]}
          >
            <Ionicons
              name="reorder-three-outline"
              size={22}
              color={item.pinned ? '#ccc' : '#666'}
              style={styles.handle}
              accessibilityLabel={item.pinned ? undefined : `Drag ${item.label}`}
            />
            <Ionicons name={item.icon} size={22} color={visible ? '#333' : '#999'} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, !visible && styles.rowLabelHidden]}>{item.label}</Text>
            {item.pinned ? (
              <Text style={styles.pinnedNote}>Always shown</Text>
            ) : (
              <>
                <IconButton icon="chevron-up" size={18} disabled={!canMoveUp} onPress={() => move(item.key, -1)} accessibilityLabel={`Move ${item.label} up`} />
                <IconButton icon="chevron-down" size={18} disabled={!canMoveDown} onPress={() => move(item.key, 1)} accessibilityLabel={`Move ${item.label} down`} />
                <Switch value={visible} onValueChange={value => toggleHidden(item.key, value)} accessibilityLabel={`Show ${item.label} in the sidebar`} />
              </>
            )}
            <IconButton
              icon="cog-outline"
              size={20}
              disabled={!SECTIONS_WITH_FIELDS.has(item.key)}
              onPress={() => {
                setSelected(item);
                setTab(SECTIONS_WITH_FIELDS.has(item.key) ? 'fields' : 'labels');
              }}
              accessibilityLabel={`${item.label} settings`}
            />
          </View>
        );
        return (
          <DraggableRow
            key={item.key}
            draggable={!item.pinned}
            onDragStart={() => setDragKey(item.key)}
            onDragEnd={() => setDragKey(null)}
            onDrop={() => dropOn(item.key)}
          >
            {row}
          </DraggableRow>
        );
      })}
      <View style={styles.actions}>
        <Button mode="contained" onPress={save} loading={saving} disabled={saving || !dirty}>
          Save
        </Button>
        <Button mode="outlined" onPress={resetToDefaults} disabled={saving}>
          Reset to defaults
        </Button>
        {dirty && <Text style={styles.unsaved}>Unsaved changes</Text>}
      </View>
    </ScrollView>
  );

  const detail = selected ? (
    <View style={styles.detail}>
      <SegmentedButtons
        value={tab}
        onValueChange={value => setTab(value as PaneTab)}
        buttons={[
          { value: 'fields', label: 'Fields', disabled: !SECTIONS_WITH_FIELDS.has(selected.key) },
          { value: 'labels', label: 'Labels', disabled: !SECTIONS_WITH_LABELS.has(selected.key) },
        ]}
        style={styles.tabs}
      />
      {tab === 'fields' ? (
        SECTIONS_WITH_FIELD_STORAGE.has(selected.key) ? (
          <CustomFieldsEditor section={NAV_KEY_TO_SECTION[selected.key]} sectionLabel={selected.label} />
        ) : (
          <Text style={styles.hint}>
            Custom fields for {selected.label} are on their way: they will show on the add/edit form and the detail page.
          </Text>
        )
      ) : (
        <Text style={styles.hint}>
          Renaming and recolouring {selected.label} statuses and tags is on its way.
        </Text>
      )}
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Settings</Text>
      <View style={styles.panes}>
        <TwoPane
          list={list}
          detail={detail}
          detailTitle={selected?.label}
          onCloseDetail={() => setSelected(null)}
          placeholder="Press a section's gear to see its fields and labels."
        />
      </View>
      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

// On web each row is a DOM node with native HTML5 drag and drop; elsewhere
// the arrows are the only way to reorder (the editor is web-only in v1).
function DraggableRow({
  draggable,
  onDragStart,
  onDragEnd,
  onDrop,
  children,
}: {
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  children: ReactNode;
}) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <div
      draggable={draggable}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        onDrop();
      }}
      style={{ cursor: draggable ? 'grab' : 'default' }}
    >
      {children}
    </div>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  title: { marginBottom: 12 },
  panes: {
    flex: 1,
    minHeight: 480,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  listContent: { padding: 16 },
  paneTitle: { marginBottom: 4 },
  hint: { color: '#666', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#ffffff',
  },
  rowSelected: { backgroundColor: '#f3f6fb' },
  rowDragging: { opacity: 0.5 },
  handle: { marginRight: 8 },
  rowIcon: { marginRight: 10 },
  rowLabel: { flex: 1, fontSize: 15, color: '#333' },
  rowLabelHidden: { color: '#999', textDecorationLine: 'line-through' },
  pinnedNote: { color: '#999', fontSize: 12, marginRight: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' },
  unsaved: { color: '#b45309' },
  detail: { padding: 16, flex: 1 },
  tabs: { marginBottom: 16, maxWidth: 320 },
});
