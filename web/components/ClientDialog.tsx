import { useEffect, useState } from 'react';
import { TextInput } from 'react-native-paper';
import { FormDialog, FormDialogFooter, FormField, FormRow, inputStyle } from './FormDialog';

// The add/edit popup for a client on the Clients list, in the same shell as
// the material and labor dialogs.

/** The fields a user can type for a client; everything else is set by the database. */
export type ClientDraft = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

type ClientLike = Partial<ClientDraft> & { uid?: string };

type Values = ClientDraft;
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = { name: '', email: '', phone: '', address: '', notes: '' };

function toValues(client?: ClientLike | null): Values {
  if (!client) return EMPTY;
  return {
    name: client.name ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    address: client.address ?? '',
    notes: client.notes ?? '',
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

  // Start from the client (or blank) every time the popup opens.
  useEffect(() => {
    if (!visible) return;
    setValues(toValues(client));
    setErrors({});
  }, [visible, client]);

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
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    onSubmit({
      name: values.name.trim(),
      email,
      phone: values.phone.trim(),
      address: values.address.trim(),
      notes: values.notes.trim(),
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
            onChangeText={change('phone')}
            keyboardType="phone-pad"
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
    </FormDialog>
  );
}
