import { useEffect, useState } from 'react';
import { TextInput } from 'react-native-paper';
import { FormDialog, FormDialogFooter, FormField, FormRow, inputStyle } from './FormDialog';
import type { Material } from '../app/(app)/inventory';

/** The fields a user can type for a material; everything else is set by the database. */
export type MaterialDraft = Pick<Material, 'sku' | 'name' | 'description' | 'cost' | 'quantity' | 'supplier' | 'category'>;

type Values = Record<'sku' | 'name' | 'description' | 'quantity' | 'cost' | 'supplier' | 'category', string>;
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = { sku: '', name: '', description: '', quantity: '', cost: '', supplier: '', category: '' };

function toValues(material?: Material | null): Values {
  if (!material) return EMPTY;
  return {
    sku: material.sku ?? '',
    name: material.name ?? '',
    description: material.description ?? '',
    quantity: material.quantity != null ? String(material.quantity) : '',
    cost: material.cost != null ? String(material.cost) : '',
    supplier: material.supplier ?? '',
    category: material.category ?? '',
  };
}

/** Blank is allowed; anything typed must be a number. */
function numberError(text: string): string | undefined {
  return text.trim() && !Number.isFinite(Number(text)) ? 'Enter a number' : undefined;
}

type MaterialDialogProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** The material being edited; leave out for a blank add form. */
  material?: Material | null;
  submitLabel: string;
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (draft: MaterialDraft) => void;
};

export function MaterialDialog({
  visible,
  title,
  subtitle,
  material,
  submitLabel,
  submitting,
  onDismiss,
  onSubmit,
}: MaterialDialogProps) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});

  // Start from the material (or blank) every time the popup opens.
  useEffect(() => {
    if (!visible) return;
    setValues(toValues(material));
    setErrors({});
  }, [visible, material]);

  const change = (field: keyof Values) => (text: string) => {
    setValues((current) => ({ ...current, [field]: text }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const next: Errors = {
      name: values.name.trim() ? undefined : 'Name is required',
      cost: numberError(values.cost),
      quantity: numberError(values.quantity),
    };
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    onSubmit({
      sku: values.sku.trim() || null,
      name: values.name.trim(),
      description: values.description.trim(),
      cost: values.cost.trim() ? Number(values.cost) : 0,
      quantity: values.quantity.trim() ? Number(values.quantity) : 0,
      supplier: values.supplier.trim(),
      category: values.category.trim(),
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
        <FormField>
          <TextInput mode="outlined" label="SKU" value={values.sku} onChangeText={change('sku')} style={inputStyle} />
        </FormField>
        <FormField>
          <TextInput
            mode="outlined"
            label="Category"
            placeholder="Lumber, Hardware"
            value={values.category}
            onChangeText={change('category')}
            style={inputStyle}
          />
        </FormField>
      </FormRow>

      <FormRow>
        <FormField error={errors.quantity}>
          <TextInput
            mode="outlined"
            label="Quantity"
            value={values.quantity}
            onChangeText={change('quantity')}
            keyboardType="numeric"
            error={!!errors.quantity}
            style={inputStyle}
          />
        </FormField>
        <FormField error={errors.cost}>
          <TextInput
            mode="outlined"
            label="Unit cost"
            value={values.cost}
            onChangeText={change('cost')}
            keyboardType="decimal-pad"
            error={!!errors.cost}
            left={<TextInput.Affix text="$" />}
            style={inputStyle}
          />
        </FormField>
      </FormRow>

      <FormField>
        <TextInput mode="outlined" label="Supplier" value={values.supplier} onChangeText={change('supplier')} style={inputStyle} />
      </FormField>

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
