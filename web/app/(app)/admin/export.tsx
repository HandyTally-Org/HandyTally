import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Snackbar, Switch, Text, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { themed } from '../../../constants/Colors';
import { useAuth } from '../../../contexts/AuthContext';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';
import { useLabels } from '../../../hooks/useLabels';
import { OutlineButton, PrimaryButton, SelectMenu, st } from '../../../components/settings/ui';
import { exportWorkbook } from '../../../utils/excel';
import { exportCsv } from '../../../utils/csv';
import {
  PAYMENT_TERMS,
  TERMS_LABELS,
  toExportDocument,
  type ExportDateFormat,
  type ExportSettings,
  type PaymentTerms,
} from '../../../constants/exportSettings';
import { invoiceStatusLabel } from '../../../constants/invoiceStatus';
import {
  EXCLUDED_INVOICE_STATUSES,
  EXPORTABLE_INVOICE_STATUSES,
  QBO_CHECKLIST,
  buildCustomersRows,
  buildInvoicesCsv,
  invoiceFileName,
  type ExportCatalogItem,
  type ExportClient,
  type ExportInvoice,
  type ExportJob,
  type ExportProblem,
} from '../../../utils/quickbooksExport';

// HT-25: Admin > Export. One "Export to" target for now, QuickBooks Online,
// with a Customers file (.xlsx) and an Invoices file (.csv) laid out column
// for column as Intuit's Import Data screens expect. The rules live in
// utils/quickbooksExport.ts; this screen fetches the organisation's rows,
// hands them over, and shows what came back (blockers, warnings, the
// three-step QuickBooks checklist).

type Target = 'quickbooks';
const TARGETS: readonly { value: Target; label: string }[] = [{ value: 'quickbooks', label: 'QuickBooks Online' }];

const DATE_FORMATS: readonly { value: ExportDateFormat; label: string }[] = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
];

type Outcome = {
  title: string;
  summary: string;
  blockers: ExportProblem[];
  warnings: ExportProblem[];
  downloaded: string[];
};

const nativeDateStyle = {
  height: 36,
  borderWidth: 1,
  borderColor: st.inputBorder,
  borderRadius: 8,
  paddingLeft: 10,
  paddingRight: 10,
  fontSize: 14,
  backgroundColor: st.panelBg,
  color: st.text,
} as const;

export default function ExportScreen() {
  const allowed = useRequireAdmin();
  const { organization, settings, refreshSettings } = useAuth();
  const clientTags = useLabels('client_tag');

  const [target, setTarget] = useState<Target>('quickbooks');

  // Export settings, edited here and saved to organization_settings.export.
  const [draft, setDraft] = useState<ExportSettings>(settings.export);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.export);
  const [savingSettings, setSavingSettings] = useState(false);

  // Customers options
  const [tag, setTag] = useState('');
  const [openingBalance, setOpeningBalance] = useState(false);

  // Invoices options
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statuses, setStatuses] = useState<Set<string>>(() => new Set(EXPORTABLE_INVOICE_STATUSES));

  const [busy, setBusy] = useState<'customers' | 'invoices' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const tagOptions = useMemo(
    () => [{ value: '', label: 'All tags' }, ...clientTags.map(t => ({ value: t.value, label: t.label }))],
    [clientTags],
  );

  if (!allowed) return null;

  const saveSettings = async () => {
    if (!organization) return;
    try {
      setSavingSettings(true);
      const { error } = await supabase
        .from('organization_settings')
        .upsert(
          {
            organization_id: organization.id,
            export: toExportDocument(draft),
            updated_at: new Date().toISOString(),
            updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          },
          { onConflict: 'organization_id' },
        )
        .select('organization_id');
      if (error) throw error;
      await refreshSettings();
      setSnackbar('Export settings saved');
    } catch (error: any) {
      console.error('Error saving export settings:', error);
      setSnackbar(`Could not save: ${error?.message ?? 'unknown error'}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Every read is scoped to the organisation explicitly, not only by RLS: a
  // superuser on the apex sees every tenant's rows (HT-88).
  const orgId = organization?.id ?? '';
  const loadClients = async (): Promise<ExportClient[]> => {
    const { data, error } = await supabase
      .from('clients')
      .select('uid, name, company, email, phone, mobile, website, address, city, state, zip, postal_code, tag')
      .eq('organization_id', orgId)
      .order('name');
    if (error) throw error;
    return (data ?? []) as ExportClient[];
  };
  const loadInvoices = async (): Promise<ExportInvoice[]> => {
    const { data, error } = await supabase
      .from('invoices')
      .select('uid, invoice_number, client_id, job_id, issue_date, due_date, terms, status, notes, fee_type, fee_amount, tax_rate, total, invoice_items (description, quantity, unit_price, amount, type, service_id, material_id, taxable)')
      .eq('organization_id', orgId);
    if (error) throw error;
    return (data ?? []) as ExportInvoice[];
  };
  const loadJobs = async (): Promise<ExportJob[]> => {
    const { data, error } = await supabase.from('jobs').select('uid, start_date').eq('organization_id', orgId);
    if (error) throw error;
    return (data ?? []) as ExportJob[];
  };
  const loadCatalog = async (table: 'materials' | 'services'): Promise<ExportCatalogItem[]> => {
    const { data, error } = await supabase.from(table).select('uid, name').eq('organization_id', orgId);
    if (error) throw error;
    return (data ?? []) as ExportCatalogItem[];
  };

  const exportCustomers = async () => {
    try {
      setBusy('customers');
      const [clients, invoices] = await Promise.all([loadClients(), openingBalance ? loadInvoices() : Promise.resolve([])]);
      const result = buildCustomersRows(clients, draft, { tags: tag ? [tag] : [], openingBalance }, invoices);
      if (result.blockers.length === 0) {
        await exportWorkbook('quickbooks-customers.xlsx', [
          { name: 'Sheet1', rows: result.rows, columnWidths: [28, 24, 14, 28, 18, 18, 10, 24, 28, 16, 8, 10, 16, 14, 12, 14] },
        ]);
      }
      setOutcome({
        title: 'Customers',
        summary: result.blockers.length > 0
          ? 'Nothing was downloaded.'
          : `${result.rows.length} customer${result.rows.length === 1 ? '' : 's'} written to quickbooks-customers.xlsx.`,
        blockers: result.blockers,
        warnings: [],
        downloaded: result.blockers.length > 0 ? [] : ['quickbooks-customers.xlsx'],
      });
    } catch (error: any) {
      console.error('Customers export failed:', error);
      setSnackbar(`Export failed: ${error?.message ?? 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const exportInvoices = async () => {
    try {
      setBusy('invoices');
      const [invoices, clients, jobs, materials, services] = await Promise.all([
        loadInvoices(), loadClients(), loadJobs(), loadCatalog('materials'), loadCatalog('services'),
      ]);
      const result = buildInvoicesCsv(invoices, clients, jobs, { materials, services }, draft, {
        from: from || undefined,
        to: to || undefined,
        statuses: [...statuses],
      });
      const downloaded: string[] = [];
      for (let i = 0; i < result.files.length; i++) {
        const name = invoiceFileName(i, result.files.length);
        await exportCsv(name, result.files[i]);
        downloaded.push(name);
      }
      const { invoices: n, rows, files, excluded } = result.summary;
      setOutcome({
        title: 'Invoices',
        summary: result.blockers.length > 0
          ? 'Nothing was downloaded.'
          : `${n} invoice${n === 1 ? '' : 's'} (${rows} line${rows === 1 ? '' : 's'}) written to ${files} file${files === 1 ? '' : 's'}.`
            + (excluded > 0 ? ` ${excluded} estimate/work order/cancelled document${excluded === 1 ? '' : 's'} in the date range left out.` : ''),
        blockers: result.blockers,
        warnings: result.warnings,
        downloaded,
      });
    } catch (error: any) {
      console.error('Invoices export failed:', error);
      setSnackbar(`Export failed: ${error?.message ?? 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const toggleStatus = (status: string, on: boolean) =>
    setStatuses(current => {
      const next = new Set(current);
      if (on) next.add(status);
      else next.delete(status);
      return next;
    });

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Export</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <Text style={styles.label}>Export to</Text>
          <SelectMenu value={target} options={TARGETS} onChange={v => setTarget(v as Target)} accessibilityLabel="Export to" style={styles.select} />
        </View>
        <Text style={styles.hint}>
          Files laid out for QuickBooks Online's Import Data screens (Settings › Import Data). Import <Text style={styles.strong}>Customers first</Text>, then Invoices.
        </Text>

        {/* Settings */}
        <Card title="Export settings" subtitle="Saved for the whole company and used by every export below.">
          <View style={styles.fields}>
            <Field label="Country">
              <TextInput
                mode="outlined"
                dense
                value={draft.country}
                onChangeText={country => setDraft(d => ({ ...d, country }))}
                style={styles.input}
                accessibilityLabel="Country"
              />
            </Field>
            <Field label="Default payment terms">
              <SelectMenu
                value={draft.terms}
                options={PAYMENT_TERMS.map(t => ({ value: t, label: TERMS_LABELS[t] }))}
                onChange={v => setDraft(d => ({ ...d, terms: v as PaymentTerms }))}
                accessibilityLabel="Default payment terms"
              />
            </Field>
            <Field label="Date format in files">
              <SelectMenu
                value={draft.dateFormat}
                options={DATE_FORMATS}
                onChange={v => setDraft(d => ({ ...d, dateFormat: v as ExportDateFormat }))}
                accessibilityLabel="Date format"
              />
            </Field>
          </View>
          <View style={styles.actions}>
            <PrimaryButton label={savingSettings ? 'Saving…' : 'Save settings'} onPress={saveSettings} disabled={savingSettings || !dirty} />
            {dirty && <OutlineButton label="Discard" onPress={() => setDraft(settings.export)} disabled={savingSettings} />}
            {dirty && <Text style={styles.unsaved}>Unsaved · exports use the values shown</Text>}
          </View>
        </Card>

        {/* Customers */}
        <Card title="Customers" subtitle="quickbooks-customers.xlsx — Intuit's 16-column customer layout.">
          <View style={styles.fields}>
            <Field label="Tag">
              <SelectMenu value={tag} options={tagOptions} onChange={setTag} accessibilityLabel="Client tag" />
            </Field>
          </View>
          <View style={styles.switchRow}>
            <Switch value={openingBalance} onValueChange={setOpeningBalance} accessibilityLabel="Write outstanding balance instead of exporting invoices" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Write outstanding balance instead of exporting invoices</Text>
              <Text style={styles.rowSub}>
                Puts each client's open invoice total in Opening Balance. Leave off when you also import the Invoices file, or the receivable is counted twice.
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <PrimaryButton label={busy === 'customers' ? 'Preparing…' : 'Download customers'} onPress={exportCustomers} disabled={busy !== null} />
          </View>
        </Card>

        {/* Invoices */}
        <Card title="Invoices" subtitle="quickbooks-invoices.csv — one row per line item, split into files of 1,000 rows.">
          <View style={styles.fields}>
            <Field label="From (invoice date)">
              <input type="date" value={from} onChange={(e: any) => setFrom(e.target.value)} style={nativeDateStyle} aria-label="From date" />
            </Field>
            <Field label="To">
              <input type="date" value={to} onChange={(e: any) => setTo(e.target.value)} style={nativeDateStyle} aria-label="To date" />
            </Field>
          </View>
          <Text style={styles.subhead}>Statuses</Text>
          {EXPORTABLE_INVOICE_STATUSES.map(status => (
            <View key={status} style={styles.switchRow}>
              <Switch value={statuses.has(status)} onValueChange={on => toggleStatus(status, on)} accessibilityLabel={invoiceStatusLabel(status)} />
              <Text style={styles.rowLabel}>{invoiceStatusLabel(status)}</Text>
            </View>
          ))}
          {Object.entries(EXCLUDED_INVOICE_STATUSES).map(([status, reason]) => (
            <View key={status} style={[styles.switchRow, styles.muted]}>
              <Switch value={false} disabled accessibilityLabel={`${invoiceStatusLabel(status)} (never exported)`} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{invoiceStatusLabel(status)}</Text>
                <Text style={styles.rowSub}>{reason}</Text>
              </View>
            </View>
          ))}
          <View style={styles.actions}>
            <PrimaryButton label={busy === 'invoices' ? 'Preparing…' : 'Download invoices'} onPress={exportInvoices} disabled={busy !== null || statuses.size === 0} />
          </View>
        </Card>

        {/* Result */}
        {outcome && (
          <Card title={`${outcome.title} — result`} subtitle={outcome.summary}>
            {outcome.blockers.map(p => <Problem key={p.code} problem={p} tone="blocker" />)}
            {outcome.warnings.map(p => <Problem key={p.code} problem={p} tone="warning" />)}
            {outcome.downloaded.length > 0 && (
              <View style={styles.checklist}>
                <Text style={styles.subhead}>Before importing into QuickBooks</Text>
                {QBO_CHECKLIST.map((line, i) => (
                  <View key={i} style={styles.checkItem}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={themed.primary} style={{ marginTop: 1 }} />
                    <Text style={styles.checkText}>{line}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={4000} action={{ label: 'Dismiss', onPress: () => setSnackbar(null) }}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text variant="titleMedium" style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.hint}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Problem({ problem, tone }: { problem: ExportProblem; tone: 'blocker' | 'warning' }) {
  const blocker = tone === 'blocker';
  return (
    <View style={[styles.problem, blocker ? styles.problemBlocker : styles.problemWarning]}>
      <View style={styles.problemHead}>
        <Ionicons name={blocker ? 'close-circle' : 'alert-circle'} size={18} color={blocker ? '#b91c1c' : '#b45309'} />
        <Text style={[styles.problemTitle, { color: blocker ? '#b91c1c' : '#b45309' }]}>{blocker ? 'Export stopped' : 'Check after import'}</Text>
      </View>
      <Text style={styles.problemText}>{problem.message}</Text>
      {problem.records.slice(0, 25).map((r, i) => <Text key={i} style={styles.problemRecord}>• {r}</Text>)}
      {problem.records.length > 25 && <Text style={styles.problemRecord}>… and {problem.records.length - 25} more</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: st.pageBg, padding: 16 },
  title: { marginBottom: 12 },
  content: { paddingBottom: 32, maxWidth: 820 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  label: { fontSize: 15, color: st.text },
  select: { minWidth: 220 },
  hint: { color: st.muted, marginBottom: 12 },
  strong: { fontWeight: '600', color: st.text },
  card: { backgroundColor: st.panelBg, borderWidth: 1, borderColor: st.border, borderRadius: 12, padding: 16, marginTop: 14 },
  cardTitle: { marginBottom: 2 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  field: { minWidth: 200, flexGrow: 1, gap: 6 },
  fieldLabel: { fontSize: 13, color: st.muted },
  input: { backgroundColor: st.panelBg },
  subhead: { fontSize: 13, color: st.muted, marginTop: 14, marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  muted: { opacity: 0.6 },
  rowLabel: { fontSize: 15, color: st.text },
  rowSub: { fontSize: 13, color: st.muted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' },
  unsaved: { color: '#b45309' },
  problem: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10 },
  problemBlocker: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  problemWarning: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  problemHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  problemTitle: { fontWeight: '600', fontSize: 14 },
  problemText: { color: '#1f2937', fontSize: 14 },
  problemRecord: { color: '#374151', fontSize: 13, marginTop: 2, marginLeft: 8 },
  checklist: { marginTop: 4 },
  checkItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 6 },
  checkText: { flex: 1, color: st.text, fontSize: 14 },
});
