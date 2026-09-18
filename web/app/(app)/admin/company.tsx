import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Snackbar, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { TWO_PANE_BREAKPOINT, TwoPane } from '../../../components/TwoPane';
import { CompanyInfoEditor, type CompanyData } from '../../../components/company/CompanyInfoEditor';
import { CompanyDocumentsEditor } from '../../../components/company/CompanyDocumentsEditor';
import { st } from '../../../components/settings/ui';
import { fileToBase64 } from '../../../utils/fileToBase64';

// HT-47: Admin > Company on the HT-50 two-pane shell. Left: the organisation
// and its sections; right: the selected one. Info is the former page (logo,
// business information) redrawn in the HT-60 panel style over the same
// company upsert and logo path. Documents is new: insurance, licences, EMR
// and the like, each a company_attachments row with is_logo = false.

type Section = 'info' | 'documents';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

const SECTIONS: { key: Section; label: string; icon: IoniconName; description: string }[] = [
  { key: 'info', label: 'Info', icon: 'business-outline', description: 'Logo, name, address and contact details' },
  { key: 'documents', label: 'Documents', icon: 'document-text-outline', description: 'Insurance, licences, EMR and other papers' },
];

// Attachment row for the logo (is_logo = true), unchanged since before HT-47.
interface CompanyAttachment {
  id?: number;
  company_id: number;
  name: string;
  file_type: string;
  file_data: string;
  created_at?: string;
  is_logo?: boolean;
}

const DEFAULT_LOGO_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgNDAwIDIwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiM0Q0FGNTAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPllvdXIgQ29tcGFueSBMb2dvPC90ZXh0Pjwvc3ZnPg==';

const EMPTY_COMPANY: CompanyData = {
  business_name: '',
  address: '',
  email: '',
  phone: '',
  ein: '',
  logo_url: null,
};

export default function AdminPage() {
  // HT-12: company settings are admin-only.
  const allowed = useRequireAdmin();
  const { organization } = useAuth();
  const { width } = useWindowDimensions();

  const [company, setCompany] = useState<CompanyData>(EMPTY_COMPANY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  // Wide screens open on Info; a narrow one shows the section list first, as Settings does.
  const [selected, setSelected] = useState<Section | null>(() => (width < TWO_PANE_BREAKPOINT ? null : 'info'));

  useRefreshOnFocus(() => {
    fetchCompanyInfo();
  });

  // The organisation's own company row. On a tenant host RLS already scopes
  // the table to one organisation, but a superuser on the apex or localhost
  // can see every organisation's row, and without this filter the page would
  // read (and then overwrite) whichever row came first. Learned the hard way
  // on 2026-09-17.
  const companyQuery = () => {
    const query = supabase.from('company').select('*');
    return organization ? query.eq('organization_id', organization.id) : query;
  };

  const fetchCompanyInfo = async () => {
    try {
      const { data, error } = await companyQuery().limit(1).maybeSingle();

      // If no company exists yet, that's okay - just use empty form
      if (error && error.code === 'PGRST116') {
        setLoading(false);
        return; // Keep the default empty state
      }

      // For other errors, throw
      if (error) throw error;

      if (data) {
        setCompany(data);
        // Set the logo URL from company data
        if (data.logo_url) {
          setLogoUrl(data.logo_url);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching company:', err);
      setError('Error fetching company information');
      setLoading(false);
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleSubmit = async () => {
    try {
      // Validate required fields
      if (!company.business_name || !company.address) {
        setError('Business name and address are required');
        return;
      }

      setSaving(true);
      const { data, error } = await supabase
        .from('company')
        .upsert({
          ...company,
          ...(organization ? { organization_id: organization.id } : {}),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (data) {
        setCompany(data);
        setError(''); // Clear any existing errors
        showSnackbar('Company information saved successfully!');
      }
    } catch (err) {
      console.error('Error saving company:', err);
      setError('Error saving company information. Please try again.');
      showSnackbar('Error saving company information');
    } finally {
      setSaving(false);
    }
  };

  // Saves a logo URL on the company row.
  const handleLogoSubmit = async (url: string) => {
    try {
      const { data, error } = await supabase
        .from('company')
        .upsert({
          ...company,
          ...(organization ? { organization_id: organization.id } : {}),
          logo_url: url,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setCompany(data);
        setLogoUrl(url);
        showSnackbar('Logo URL saved successfully!');
      }
    } catch (err) {
      console.error('Error saving logo URL:', err);
      setError('Error saving logo URL');
      showSnackbar('Error saving logo URL');
    }
  };

  // The company row an attachment hangs off. Creates one with what has been
  // typed so far when the organisation has none yet; the logo upload always
  // did this, and Documents needs the same id.
  const ensureCompanyId = async (): Promise<number> => {
    if (company.uid) return company.uid;

    const { data: newCompany, error: companyError } = await supabase
      .from('company')
      .upsert({
        business_name: company.business_name || 'My Company',
        address: company.address || '',
        ...(organization ? { organization_id: organization.id } : {}),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (companyError) throw companyError;
    if (!newCompany) throw new Error('Failed to create company record');

    setCompany(newCompany);
    return newCompany.uid;
  };

  // Picks an image and saves it to company_attachments as the logo.
  const pickImage = async () => {
    try {
      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8, // Lower quality to reduce size
      });

      if (result.canceled) {
        return;
      }

      setLogoBusy(true);
      const file = result.assets[0];

      // Get file extension
      const fileExt = file.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `company-logo-${Date.now()}.${fileExt}`;

      // Convert image to base64
      const base64Data = await fileToBase64(file.uri);

      // Determine file type from extension
      let fileType = 'image/jpeg';
      if (fileExt === 'png') fileType = 'image/png';
      if (fileExt === 'gif') fileType = 'image/gif';
      if (fileExt === 'svg') fileType = 'image/svg+xml';

      const companyId = await ensureCompanyId();

      const attachment: CompanyAttachment = {
        company_id: companyId,
        name: fileName,
        file_type: fileType,
        file_data: base64Data,
        is_logo: true
      };

      // Save attachment
      const { error: attachmentError } = await supabase
        .from('company_attachments')
        .insert(attachment)
        .select()
        .single();

      if (attachmentError) {
        console.error('Attachment error details:', attachmentError);

        // Check if the table doesn't exist
        if (attachmentError.message?.includes('relation "company_attachments" does not exist')) {
          console.error('The company_attachments table does not exist. Please create it first.');
          showSnackbar('The company_attachments table does not exist. Please contact the system administrator.');
          return;
        }
        throw attachmentError;
      }

      // Create a data URL for immediate display
      const dataUrl = `data:${fileType};base64,${base64Data}`;

      // Update company with new logo URL
      await handleLogoSubmit(dataUrl);

      showSnackbar('Logo uploaded and saved successfully!');

      // Force reload to update sidebar
      setTimeout(() => window.location.reload(), 1500); // Give time to see the snackbar before reload
    } catch (error: any) {
      console.error('Error uploading image:', error);
      showSnackbar('Error uploading image: ' + (error.message || 'Unknown error'));
    } finally {
      setLogoBusy(false);
    }
  };

  // Function to use default logo
  const useDefaultLogo = async () => {
    try {
      setLogoBusy(true);
      await handleLogoSubmit(DEFAULT_LOGO_URL);
      setLogoUrl(DEFAULT_LOGO_URL);
      showSnackbar('Default logo set successfully!');

      // Force reload to update sidebar
      setTimeout(() => window.location.reload(), 1500); // Give time to see the snackbar before reload
    } catch (error: any) {
      console.error('Error setting default logo:', error);
      showSnackbar('Error setting default logo: ' + (error.message || 'Unknown error'));
    } finally {
      setLogoBusy(false);
    }
  };

  if (!allowed) {
    return null;
  }

  const companyName = organization?.name || company.business_name || 'Your company';
  const current = SECTIONS.find(section => section.key === selected) ?? null;

  const list = (
    <ScrollView contentContainerStyle={styles.listContent}>
      <Text variant="titleMedium" style={styles.paneTitle}>{companyName}</Text>
      <Text style={styles.hint}>What clients see on your estimates and invoices, and the papers behind it.</Text>
      {SECTIONS.map(section => {
        const isSelected = selected === section.key;
        return (
          <Pressable
            key={section.key}
            onPress={() => setSelected(section.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${section.label} section`}
            style={({ hovered }: any) => [styles.row, hovered && styles.rowHover, isSelected && styles.rowSelected]}
          >
            <View style={[styles.rowIcon, isSelected && styles.rowIconSelected]}>
              <Ionicons name={section.icon} size={18} color={isSelected ? '#ffffff' : '#374151'} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{section.label}</Text>
              <Text style={styles.rowDescription} numberOfLines={2}>{section.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={st.faint} />
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // key={selected} remounts the section on every switch (the HT-50 lesson):
  // Documents keeps its own draft and only resyncs it when clean, so without
  // a fresh instance one section's rows could outlive the switch.
  const detail = selected === null ? null : loading ? (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
      <Text style={styles.loadingText}>Loading company profile...</Text>
    </View>
  ) : selected === 'info' ? (
    <CompanyInfoEditor
      key="info"
      company={company}
      onChange={patch => setCompany(current => ({ ...current, ...patch }))}
      logoUrl={logoUrl}
      onChangeLogo={pickImage}
      onDefaultLogo={useDefaultLogo}
      logoBusy={logoBusy}
      onSave={handleSubmit}
      saving={saving}
      error={error}
    />
  ) : selected === 'documents' ? (
    <CompanyDocumentsEditor key="documents" companyId={company.uid ?? null} ensureCompanyId={ensureCompanyId} />
  ) : null;

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Company</Text>
      <View style={styles.panes}>
        <TwoPane
          list={list}
          detail={detail}
          detailTitle={current?.label}
          detailSubtitle={current?.description}
          onCloseDetail={() => setSelected(null)}
          placeholder="Pick a section to see it here."
          listWidth={320}
        />
      </View>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbarVisible(false)
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: st.pageBg, padding: 16 },
  title: { marginBottom: 12 },
  panes: {
    flex: 1,
    minHeight: 480,
    borderWidth: 1,
    borderColor: st.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  listContent: { padding: 16 },
  paneTitle: { marginBottom: 4 },
  hint: { color: st.muted, fontSize: 13, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  rowHover: { backgroundColor: st.softBg },
  rowSelected: { backgroundColor: '#f3f6fb' },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: st.rowBorder,
  },
  rowIconSelected: { backgroundColor: st.primary },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: st.text },
  rowDescription: { fontSize: 12.5, color: st.muted, marginTop: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 16, color: st.muted },
});
