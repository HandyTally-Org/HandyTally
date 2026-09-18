import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, Checkbox, Snackbar } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fileToBase64 } from '../../utils/fileToBase64';
import {
  MAX_DOCUMENT_FILE_BYTES,
  base64ByteLength,
  diffDocumentRows,
  fileTooLargeMessage,
  formatFileSize,
  hasDocumentChanges,
  newDocumentRow,
  recordToRow,
  validateDocumentRows,
  type CompanyDocumentRecord,
  type CompanyDocumentRow,
} from '../../utils/companyDocuments';
import { LabelPill } from '../LabelPill';
import { AddPanel, FieldCaption, LinkButton, OutlineButton, PrimaryButton, SectionLabel, SettingsInput, st, tbl } from '../settings/ui';

// HT-47: the Documents section of Admin > Company, on the Settings table
// pattern (CustomFieldsEditor): one row per document with its name, details
// and attachment, per-row attach / replace / open / remove, a dashed add
// panel, and an explicit Save / Discard. Each row is a company_attachments
// record with is_logo = false; the file is base64 in file_data like the
// logo, and is only read back when the admin opens it.

const LIST_COLUMNS = 'id, label, value, name, file_type, file_size, include_on_invoices';
const PENDING_PILL = { color: '#fef3c7', textColor: '#92400e' };

type Props = {
  /** company.uid, or null when the organisation has not saved its business information yet. */
  companyId: number | null;
  /** Creates the company row if there is none yet and returns its id; the logo path uses the same one. */
  ensureCompanyId: () => Promise<number>;
};

/** Opens a base64 file in a new browser tab. Web only; the editor is web-only in v1. */
function openBase64File(base64: string, fileType: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: fileType }));
  window.open(url, '_blank', 'noopener');
  // The tab has loaded it by then; a data-URL navigation is blocked by browsers, hence the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A quiet inline action, for "Open" beside the red Remove link. */
function QuietLink({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ hovered }: any) => [styles.quietLink, hovered && styles.quietLinkHover]}>
      <Text style={styles.quietLinkText}>{label}</Text>
    </Pressable>
  );
}

export function CompanyDocumentsEditor({ companyId, ensureCompanyId }: Props) {
  const { session, organization } = useAuth();

  const [saved, setSaved] = useState<CompanyDocumentRow[]>([]);
  const [rows, setRows] = useState<CompanyDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Add panel.
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');

  const dirty = hasDocumentChanges(saved, rows);

  const load = useCallback(async () => {
    if (companyId === null) {
      setSaved([]);
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('company_attachments')
        .select(LIST_COLUMNS)
        .eq('company_id', companyId)
        .eq('is_logo', false)
        .order('id', { ascending: true });
      if (error) throw error;
      const loaded = ((data ?? []) as CompanyDocumentRecord[]).map(recordToRow);
      setSaved(loaded);
      setRows(loaded);
    } catch (error: any) {
      console.error('Error loading company documents:', error);
      setSnackbar(`Could not load documents: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: string, patch: Partial<CompanyDocumentRow>) =>
    setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)));

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    setRows(current => [...current, newDocumentRow(label, newValue.trim())]);
    setNewLabel('');
    setNewValue('');
  };

  const attach = async (row: CompanyDocumentRow) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: false });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.size != null && asset.size > MAX_DOCUMENT_FILE_BYTES) {
        setSnackbar(fileTooLargeMessage(asset.name, asset.size));
        return;
      }
      const base64 = await fileToBase64(asset.uri);
      const size = asset.size ?? base64ByteLength(base64);
      if (size > MAX_DOCUMENT_FILE_BYTES) {
        setSnackbar(fileTooLargeMessage(asset.name, size));
        return;
      }
      update(row.key, {
        fileName: asset.name,
        fileType: asset.mimeType || 'application/octet-stream',
        fileSize: size,
        pendingFileData: base64,
        fileChanged: true,
      });
    } catch (error: any) {
      console.error('Error picking document file:', error);
      setSnackbar(`Could not read the file: ${error?.message || 'unknown error'}`);
    }
  };

  const removeFile = (row: CompanyDocumentRow) =>
    update(row.key, { fileName: null, fileType: null, fileSize: null, pendingFileData: null, fileChanged: row.id !== null });

  const open = async (row: CompanyDocumentRow) => {
    try {
      let base64 = row.pendingFileData;
      let fileType = row.fileType;
      if (!base64 && row.id !== null) {
        const { data, error } = await supabase.from('company_attachments').select('file_data, file_type').eq('id', row.id).single();
        if (error) throw error;
        base64 = data?.file_data ?? null;
        fileType = data?.file_type ?? fileType;
      }
      if (!base64) {
        setSnackbar('This document has no file attached.');
        return;
      }
      openBase64File(base64, fileType || 'application/octet-stream');
    } catch (error: any) {
      console.error('Error opening document file:', error);
      setSnackbar(`Could not open the file: ${error?.message || 'unknown error'}`);
    }
  };

  const save = async () => {
    const problem = validateDocumentRows(rows);
    if (problem) {
      setSnackbar(problem);
      return;
    }
    try {
      setSaving(true);
      const userId = session?.user?.id ?? null;
      const id = await ensureCompanyId();
      const { inserts, updates, deletedIds } = diffDocumentRows(saved, rows);

      if (inserts.length > 0) {
        const { error } = await supabase.from('company_attachments').insert(
          inserts.map(row => ({
            company_id: id,
            ...(organization ? { organization_id: organization.id } : {}),
            is_logo: false,
            label: row.label.trim(),
            value: row.value.trim(),
            include_on_invoices: row.includeOnInvoices,
            name: row.fileName,
            file_type: row.fileType,
            file_size: row.fileSize,
            file_data: row.pendingFileData,
            uploaded_by: userId,
            updated_by: userId,
          })),
        );
        if (error) throw error;
      }

      for (const row of updates) {
        const { error } = await supabase
          .from('company_attachments')
          .update({
            label: row.label.trim(),
            value: row.value.trim(),
            include_on_invoices: row.includeOnInvoices,
            updated_by: userId,
            ...(row.fileChanged
              ? { name: row.fileName, file_type: row.fileType, file_size: row.fileSize, file_data: row.pendingFileData }
              : {}),
          })
          .eq('id', row.id as number);
        if (error) throw error;
      }

      if (deletedIds.length > 0) {
        const { error } = await supabase.from('company_attachments').delete().in('id', deletedIds);
        if (error) throw error;
      }

      await load();
      setSnackbar('Documents saved');
    } catch (error: any) {
      console.error('Error saving company documents:', error);
      setSnackbar(`Could not save: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Documents</SectionLabel>
        <Text style={styles.hint}>
          Insurance, licences, your EMR and any other paper a client may ask for. Details are free text. Tick
          "On invoices" to print the name and details on estimates and invoices; if the row has a file, it is
          also attached to the emails you send.
        </Text>

        {rows.length === 0 ? (
          <Text style={styles.empty}>No documents yet — add one below.</Text>
        ) : (
          <View style={styles.table}>
            <View style={tbl.headRow}>
              <Text style={[tbl.th, styles.colLabel]}>Document</Text>
              <Text style={[tbl.th, styles.colValue]}>Details</Text>
              <Text style={[tbl.th, styles.colFile]}>Attachment</Text>
              <Text style={[tbl.th, styles.colInvoices]}>On invoices</Text>
              <View style={styles.colRemove} />
            </View>
            {rows.map(row => {
              const hasFile = row.fileName !== null;
              const pending = row.pendingFileData !== null;
              return (
                <View key={row.key} style={[tbl.row, styles.rowTop]}>
                  <View style={[tbl.cell, styles.colLabel]}>
                    <SettingsInput
                      value={row.label}
                      onChangeText={label => update(row.key, { label })}
                      placeholder="e.g. General liability insurance"
                      accessibilityLabel={`Name of ${row.label || 'document'}`}
                    />
                  </View>
                  <View style={[tbl.cell, styles.colValue]}>
                    <SettingsInput
                      value={row.value}
                      onChangeText={value => update(row.key, { value })}
                      placeholder="Policy or licence number, carrier, expiry…"
                      accessibilityLabel={`Details of ${row.label || 'document'}`}
                    />
                  </View>
                  <View style={[tbl.cell, styles.colFile]}>
                    {hasFile ? (
                      <View style={styles.fileLine}>
                        <Text style={tbl.body} numberOfLines={1}>{row.fileName}</Text>
                        <Text style={tbl.mono}>{formatFileSize(row.fileSize)}</Text>
                        {pending ? <LabelPill label="Not saved yet" size="sm" {...PENDING_PILL} /> : null}
                      </View>
                    ) : (
                      <Text style={tbl.bodyMuted}>No file</Text>
                    )}
                    <View style={styles.fileActions}>
                      <OutlineButton label={hasFile ? 'Replace' : 'Attach file'} onPress={() => attach(row)} disabled={saving} />
                      {hasFile ? <QuietLink label="Open" onPress={() => open(row)} accessibilityLabel={`Open the file of ${row.label || 'document'}`} /> : null}
                      {hasFile ? <LinkButton label="Remove file" onPress={() => removeFile(row)} accessibilityLabel={`Remove the file of ${row.label || 'document'}`} /> : null}
                    </View>
                  </View>
                  <View style={[tbl.cell, styles.colInvoices]}>
                    <Checkbox
                      status={row.includeOnInvoices ? 'checked' : 'unchecked'}
                      onPress={() => update(row.key, { includeOnInvoices: !row.includeOnInvoices })}
                    />
                  </View>
                  <View style={[tbl.cell, styles.colRemove, styles.right]}>
                    <LinkButton
                      label="Remove"
                      onPress={() => setRows(current => current.filter(r => r.key !== row.key))}
                      accessibilityLabel={`Remove ${row.label || 'document'}`}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.addWrap}>
          <AddPanel>
            <View style={styles.addLabel}>
              <FieldCaption>Document</FieldCaption>
              <SettingsInput value={newLabel} onChangeText={setNewLabel} placeholder="e.g. Contractor licence" accessibilityLabel="New document name" />
            </View>
            <View style={styles.addValue}>
              <FieldCaption>Details</FieldCaption>
              <SettingsInput value={newValue} onChangeText={setNewValue} placeholder="e.g. Lic. #123456, expires 12/2027" accessibilityLabel="New document details" />
            </View>
            <PrimaryButton label="+ Add document" onPress={add} disabled={!newLabel.trim()} />
          </AddPanel>
          <Text style={styles.addHint}>Attach the file from the row once it is added. Files up to {formatFileSize(MAX_DOCUMENT_FILE_BYTES)}.</Text>
        </View>

        <View style={styles.footer}>
          <PrimaryButton label={saving ? 'Saving…' : 'Save documents'} onPress={save} disabled={saving || !dirty} />
          <OutlineButton label="Discard changes" onPress={() => setRows(saved)} disabled={saving || !dirty} />
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { padding: 22 },
  hint: { fontSize: 13.5, color: st.muted, marginBottom: 16, maxWidth: 720 },
  empty: { fontSize: 13.5, color: st.faint, marginBottom: 14 },
  table: { marginBottom: 4 },
  rowTop: { alignItems: 'flex-start' },
  colLabel: { flex: 2.4, minWidth: 170 },
  colValue: { flex: 3, minWidth: 190 },
  colFile: { flex: 3, minWidth: 220 },
  colInvoices: { width: 100, alignItems: 'center' },
  colRemove: { width: 84 },
  right: { alignItems: 'flex-end' },
  fileLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  fileActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  quietLink: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4 },
  quietLinkHover: { backgroundColor: st.rowBorder },
  quietLinkText: { color: st.text, fontSize: 13, fontWeight: '600' },
  addWrap: { marginTop: 14, marginBottom: 26 },
  addLabel: { flexGrow: 1, minWidth: 200 },
  addValue: { flexGrow: 2, minWidth: 240 },
  addHint: { fontSize: 12, color: st.faint, marginTop: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  unsaved: { color: '#b45309', fontSize: 13 },
});
