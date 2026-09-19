import { useEffect, useState } from 'react';
import { TextInput } from 'react-native-paper';
import { CustomFieldInputs } from './CustomFields';
import { useCustomFields } from '../hooks/useCustomFields';
import { useLabels } from '../hooks/useLabels';
import { findLabel, labelText } from '../constants/labels';
import { normalizeCustomValues, validateCustomValues, type CustomFieldValues } from '../constants/customFields';
import { FormDialog, FormDialogFooter, FormField, FormRow, inputStyle } from './FormDialog';
import { themed } from '../constants/Colors';
import { formatPhone } from '../utils/formatting';

// The add/edit popup for a client on the Clients list, in the same shell as
// the material and labor dialogs.

/** The fields a user can type for a client; everything else is set by the database. */
export type ClientDraft = {
  name: string;
  /** HT-25: company name (QuickBooks "Company"); '' for none. */
  company: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  /** HT-80: a client_tag label value, or '' for no tag. */
  tag: string;
  /** HT-52: values of the organisation's custom fields, keyed by field key. */
  custom_fields: CustomFieldValues;
};

/** A client row as stored: every draft field may be missing or null. */
type ClientLike = { [K in keyof ClientDraft]?: ClientDraft[K] | null } & { uid?: string };

type Values = Omit<ClientDraft, 'custom_fields'>;
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = { name: '', company: '', email: '', phone: '', address: '', notes: '', tag: '' };

function toValues(client?: ClientLike | null): Values {
  if (!client) return EMPTY;
  return {
    name: client.name ?? '',
    company: client.company ?? '',
    email: client.email ?? '',
    phone: formatPhone(client.phone),
    address: client.address ?? '',
    notes: client.notes ?? '',
    tag: client.tag ?? '',
  };
}

type ClientDialogProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** The client being edited; leave out for a blank add form. */
  client?: ClientLike | null;
  submitLabel: string;
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (draft: ClientDraft) => void;
};

export function ClientDialog({
  visible,
  title,
  subtitle,
  client,
  submitLabel,
  submitting,
  onDismiss,
  onSubmit,
}: ClientDialogProps) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  // HT-80: the same label-backed tag values the Clients list dropdown uses.
  const clientTags = useLabels('client_tag');
  // HT-52: the organisation's custom fields for this section.
  const customDefs = useCustomFields('clients');
  const [customValues, setCustomValues] = useState<CustomFieldValues>({});
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});

  // Start from the client (or blank) every time the popup opens.
  useEffect(() => {
    if (!visible) return;
    setValues(toValues(client));
    setErrors({});
    setCustomValues({ ...(client?.custom_fields ?? {}) });
    setCustomErrors({});
  }, [visible, client]);

  const changeCustom = (key: string, value: unknown) => {
    setCustomValues((current) => ({ ...current, [key]: value }));
    if (customErrors[key]) setCustomErrors((current) => ({ ...current, [key]: '' }));
  };

  const change = (field: keyof Values) => (text: string) => {
    setValues((current) => ({ ...current, [field]: text }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const email = values.email.trim();
    const next: Errors = {
      name: values.name.trim() ? undefined : 'Name is required',
      email: email && !/\S+@\S+\.\S+/.test(email) ? 'Enter a valid email address' : undefined,
    };
    const nextCustom = validateCustomValues(customDefs, customValues);
    if (Object.values(next).some(Boolean) || Object.keys(nextCustom).length > 0) {
      setErrors(next);
      setCustomErrors(nextCustom);
      return;
    }
    onSubmit({
      name: values.name.trim(),
      company: values.company.trim(),
      email,
      phone: values.phone.trim(),
      address: values.address.trim(),
      notes: values.notes.trim(),
      tag: values.tag,
      custom_fields: normalizeCustomValues(customDefs, customValues),
    });
  };

  return (
    <FormDialog
      visible={visible}
      title={title}
      subtitle={subtitle}
      onDismiss={onDismiss}
      footer={<FormDialogFooter onCancel={onDismiss} onSubmit={submit} submitLabel={submitLabel} submitting={submitting} />}
    >
      <FormRow>
        <FormField error={errors.name}>
          <TextInput
            mode="outlined"
            label="Name"
            value={values.name}
            onChangeText={change('name')}
            error={!!errors.name}
            style={inputStyle}
            autoFocus
          />
        </FormField>
        <FormField>
          <TextInput
            mode="outlined"
            label="Company"
            value={values.company}
            onChangeText={change('company')}
            style={inputStyle}
          />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField error={errors.email}>
          <TextInput
            mode="outlined"
            label="Email"
            value={values.email}
            onChangeText={change('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={!!errors.email}
            style={inputStyle}
          />
        </FormField>
        <FormField>
          <TextInput
            mode="outlined"
            label="Phone"
            value={values.phone}
            onChangeText={text => change('phone')(formatPhone(text))}
            keyboardType="phone-pad"
            placeholder="+1 (555) 555-0100"
            maxLength={17}
            style={inputStyle}
          />
        </FormField>
      </FormRow>

      <FormField>
        <TextInput
          mode="outlined"
          label="Address"
          value={values.address}
          onChangeText={change('address')}
          multiline
          numberOfLines={2}
          style={inputStyle}
        />
      </FormField>

      <FormField>
        <TextInput
          mode="outlined"
          label="Notes"
          value={values.notes}
          onChangeText={change('notes')}
          multiline
          numberOfLines={3}
          style={inputStyle}
        />
      </FormField>

      <FormField label="Tag">
        {/* HT-80: label-backed dropdown, matching the Clients list and Client Details. */}
        <select
          value={values.tag}
          onChange={(e) => change('tag')(e.target.value)}
          style={{
            padding: 8,
            borderRadius: 4,
            borderColor: themed.line,
            backgroundColor: themed.panel,
            color: themed.text,
            fontWeight: 'bold',
            width: '100%',
          }}
        >
          <option value="">No Tag</option>
          {values.tag && !findLabel(clientTags, values.tag) && (
            <option value={values.tag}>{labelText(clientTags, values.tag)}</option>
          )}
          {clientTags.map(tag => (
            <option key={tag.value} value={tag.value}>{tag.label}</option>
          ))}
        </select>
      </FormField>

      <CustomFieldInputs defs={customDefs} values={customValues} errors={customErrors} onChange={changeCustom} />
    </FormDialog>
  );
}
