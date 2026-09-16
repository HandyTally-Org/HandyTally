import { useEffect, useState } from 'react';
import { TextInput } from 'react-native-paper';
import { FormDialog, FormDialogFooter, FormField, FormRow, inputStyle } from './FormDialog';
import type { Service } from '../app/(app)/labor';

// There is no Unit field: `services.unit` is a numeric column in the database,
// so a label such as "hour" cannot be stored there. The Labor table shows
// "hour" whenever the column is empty.

/** The fields a user can type for a labor code; everything else is set by the database. */
export type ServiceDraft = Pick<Service, 'name' | 'description' | 'rate' | 'category'>;

type Values = Record<'name' | 'description' | 'rate' | 'category', string>;
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = { name: '', description: '', rate: '', category: '' };

function toValues(service?: Service | null): Values {
  if (!service) return EMPTY;
  return {
    name: service.name ?? '',
    description: service.description ?? '',
    rate: service.rate != null ? String(service.rate) : '',
    category: service.category ?? '',
  };
}

function rateError(text: string): string | undefined {
  if (!text.trim()) return 'Rate is required';
  return Number.isFinite(Number(text)) ? undefined : 'Enter a number';
}

type ServiceDialogProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** The labor code being edited; leave out for a blank add form. */
  service?: Service | null;
  submitLabel: string;
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (draft: ServiceDraft) => void;
};

export function ServiceDialog({
  visible,
  title,
  subtitle,
  service,
  submitLabel,
  submitting,
  onDismiss,
  onSubmit,
}: ServiceDialogProps) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});

  // Start from the service (or blank) every time the popup opens.
  useEffect(() => {
    if (!visible) return;
    setValues(toValues(service));
    setErrors({});
  }, [visible, service]);

  const change = (field: keyof Values) => (text: string) => {
    setValues((current) => ({ ...current, [field]: text }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const next: Errors = {
      name: values.name.trim() ? undefined : 'Name is required',
      rate: rateError(values.rate),
    };
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      rate: Number(values.rate),
      category: values.category.trim(),
    });
  };

  return (
    <FormDialog
      visible={visible}
      title={title}
      subtitle={subtitle}
      onDismiss={onDismiss}
      maxWidth={480}
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
        <FormField error={errors.rate}>
          <TextInput
            mode="outlined"
            label="Rate per hour"
            value={values.rate}
            onChangeText={change('rate')}
            keyboardType="decimal-pad"
            error={!!errors.rate}
            left={<TextInput.Affix text="$" />}
            style={inputStyle}
          />
        </FormField>
        <FormField>
          <TextInput
            mode="outlined"
            label="Category"
            placeholder="Plumbing, Electrical"
            value={values.category}
            onChangeText={change('category')}
            style={inputStyle}
          />
        </FormField>
      </FormRow>

      <FormField>
        <TextInput
          mode="outlined"
          label="Description"
          value={values.description}
          onChangeText={change('description')}
          multiline
          numberOfLines={3}
          style={inputStyle}
        />
      </FormField>
    </FormDialog>
  );
}
