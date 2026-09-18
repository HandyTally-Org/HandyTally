import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { FormField, FormRow } from '../FormDialog';
import { FormActions, FormPanel, FormSection, formLayoutTheme, useOutlinedInputProps } from '../FormLayout';
import { OutlineButton, PrimaryButton, st } from '../settings/ui';
import { formatEin } from '../../utils/formatting';

// HT-47: the Info section of Admin > Company: the logo in its own card, then
// the business information in the HT-60 panel style (FormPanel, uppercase
// FormSection headings, outlined inputs, two columns where fields pair up).
// The fields, the company upsert and the logo path are the page's; this
// only draws them.

export interface CompanyData {
  uid?: number;
  business_name: string;
  address: string;
  email: string | null;
  phone: string | null;
  ein: string | null;
  logo_url: string | null;
}

type Props = {
  company: CompanyData;
  onChange: (patch: Partial<CompanyData>) => void;
  logoUrl: string;
  onChangeLogo: () => void;
  onDefaultLogo: () => void;
  /** True while a logo is being uploaded or reset. */
  logoBusy: boolean;
  onSave: () => void;
  saving: boolean;
  error: string;
};

export function CompanyInfoEditor({ company, onChange, logoUrl, onChangeLogo, onDefaultLogo, logoBusy, onSave, saving, error }: Props) {
  const outlinedInputProps = useOutlinedInputProps();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <FormPanel title="Logo" subtitle="Shown in the sidebar and at the top of every estimate and invoice.">
        <View style={styles.logoRow}>
          <Pressable
            onPress={onChangeLogo}
            disabled={logoBusy}
            accessibilityRole="button"
            accessibilityLabel="Change company logo"
            style={({ hovered }: any) => [styles.logoBox, hovered && !logoBusy && styles.logoBoxHover]}
          >
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoImage} accessibilityLabel="Company logo" />
            ) : (
              <Text style={styles.logoEmpty}>No logo yet</Text>
            )}
          </Pressable>
          <View style={styles.logoActions}>
            <View style={styles.logoButtons}>
              <PrimaryButton label={logoBusy ? 'Working…' : 'Change logo'} onPress={onChangeLogo} disabled={logoBusy} />
              <OutlineButton label="Use default" onPress={onDefaultLogo} disabled={logoBusy} />
            </View>
            <Text style={styles.logoHint}>
              PNG, JPG, GIF or SVG. The image is kept with your company attachments and replaces the logo everywhere at once.
            </Text>
          </View>
        </View>
      </FormPanel>

      <FormPanel title="Business information" subtitle="What clients see on your documents and how they reach you.">
        <FormSection title="Business">
          <FormField label="Business name">
            <TextInput
              value={company.business_name}
              onChangeText={text => onChange({ business_name: text })}
              placeholder="Your company name"
              {...outlinedInputProps}
            />
          </FormField>
          <FormField label="Address">
            <TextInput
              value={company.address}
              onChangeText={text => onChange({ address: text })}
              placeholder="Street, city, state, ZIP"
              multiline
              numberOfLines={3}
              {...outlinedInputProps}
            />
          </FormField>
        </FormSection>

        <FormSection title="Contact">
          <FormRow>
            <FormField label="Email">
              <TextInput
                value={company.email || ''}
                onChangeText={text => onChange({ email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="office@example.com"
                {...outlinedInputProps}
              />
            </FormField>
            <FormField label="Phone">
              <TextInput
                value={company.phone || ''}
                onChangeText={text => onChange({ phone: text })}
                keyboardType="phone-pad"
                placeholder="(555) 555-0100"
                {...outlinedInputProps}
              />
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title="Tax">
          <FormRow>
            <FormField label="EIN">
              <TextInput
                value={formatEin(company.ein)}
                onChangeText={text => onChange({ ein: formatEin(text) })}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="12-3456789"
                {...outlinedInputProps}
              />
            </FormField>
            <View />
          </FormRow>
        </FormSection>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FormActions onSubmit={onSave} submitLabel="Save changes" submitting={saving} />
      </FormPanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22, gap: 16 },
  logoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20 },
  logoBox: {
    width: 160,
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: formLayoutTheme.border,
    backgroundColor: st.softBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoBoxHover: { borderColor: st.faint },
  logoImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  logoEmpty: { color: st.faint, fontSize: 13 },
  logoActions: { flex: 1, minWidth: 220, gap: 10 },
  logoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  logoHint: { fontSize: 12.5, color: st.muted, lineHeight: 18 },
  error: { color: st.danger, fontSize: 13, marginBottom: 8 },
});
