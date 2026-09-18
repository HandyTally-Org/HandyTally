import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { FormActions, FormPanel, formLayoutTheme, useOutlinedInputProps } from '../FormLayout';
import { AddPanel, FieldCaption, OutlineButton, PrimaryButton, st } from '../settings/ui';
import { formatCurrency } from '../../utils/formatting';
import { useAppTheme } from '../../contexts/ThemeContext';

// HT-86: the "Add Costs" editor on Job > Costs, drawn in the HT-60 panel
// style the rest of the app's forms use (FormPanel, uppercase section
// headings, outlined inputs, dashed add panel). The line-item state and the
// service / material pickers stay on the job page; this only draws them.

export type ServiceLine = { service: { name: string }; rate: string; quantity: string };
export type MaterialLine = { material: { name: string }; cost: string; quantity: string };
export type CustomLine = { description: string; price: string };
export type CustomLineInput = { description: string; price: string };

type Props = {
  services: ServiceLine[];
  onServiceChange: (index: number, field: 'rate' | 'quantity', value: string) => void;
  onRemoveService: (index: number) => void;
  onAddService: () => void;
  materials: MaterialLine[];
  onMaterialChange: (index: number, field: 'cost' | 'quantity', value: string) => void;
  onRemoveMaterial: (index: number) => void;
  onAddMaterial: () => void;
  customItems: CustomLine[];
  onRemoveCustomItem: (index: number) => void;
  customItemInput: CustomLineInput;
  onCustomItemInputChange: (patch: Partial<CustomLineInput>) => void;
  onAddCustomItem: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
};

const money = (value: string | number) => formatCurrency(typeof value === 'string' ? parseFloat(value || '0') : value);
const lineTotal = (unit: string, quantity: string) => parseFloat(unit || '0') * parseFloat(quantity || '0');

export function JobCostsEditor({
  services,
  onServiceChange,
  onRemoveService,
  onAddService,
  materials,
  onMaterialChange,
  onRemoveMaterial,
  onAddMaterial,
  customItems,
  onRemoveCustomItem,
  customItemInput,
  onCustomItemInputChange,
  onAddCustomItem,
  onCancel,
  onSave,
  saving = false,
}: Props) {
  const input = useOutlinedInputProps();
  const serviceTotal = services.reduce((sum, line) => sum + lineTotal(line.rate, line.quantity), 0);
  const materialTotal = materials.reduce((sum, line) => sum + lineTotal(line.cost, line.quantity), 0);
  const customTotal = customItems.reduce((sum, line) => sum + parseFloat(line.price || '0'), 0);
  const grandTotal = serviceTotal + materialTotal + customTotal;
  const lineCount = services.length + materials.length + customItems.length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <FormPanel title="Add costs" subtitle="Services from your labor list, materials from inventory, and anything else as a custom item." maxWidth={860}>
        <CostSection
          title="Services"
          count={services.length}
          subtotal={serviceTotal}
          action={<OutlineButton label="+ Add service" onPress={onAddService} disabled={saving} />}
          empty="No services yet. Add one from your labor list."
        >
          {services.map((line, index) => (
            <LineRow key={`service-${index}`} name={line.service.name} total={lineTotal(line.rate, line.quantity)} onRemove={() => onRemoveService(index)}>
              <View style={styles.field}>
                <FieldCaption>Rate</FieldCaption>
                <TextInput {...input} value={line.rate} onChangeText={text => onServiceChange(index, 'rate', text)} keyboardType="numeric" dense left={<TextInput.Affix text="$" />} />
              </View>
              <View style={styles.fieldNarrow}>
                <FieldCaption>Qty</FieldCaption>
                <TextInput {...input} value={line.quantity} onChangeText={text => onServiceChange(index, 'quantity', text)} keyboardType="numeric" dense />
              </View>
            </LineRow>
          ))}
        </CostSection>

        <CostSection
          title="Materials"
          count={materials.length}
          subtotal={materialTotal}
          action={<OutlineButton label="+ Add material" onPress={onAddMaterial} disabled={saving} />}
          empty="No materials yet. Add one from inventory."
        >
          {materials.map((line, index) => (
            <LineRow key={`material-${index}`} name={line.material.name} total={lineTotal(line.cost, line.quantity)} onRemove={() => onRemoveMaterial(index)}>
              <View style={styles.field}>
                <FieldCaption>Cost</FieldCaption>
                <TextInput {...input} value={line.cost} onChangeText={text => onMaterialChange(index, 'cost', text)} keyboardType="numeric" dense left={<TextInput.Affix text="$" />} />
              </View>
              <View style={styles.fieldNarrow}>
                <FieldCaption>Qty</FieldCaption>
                <TextInput {...input} value={line.quantity} onChangeText={text => onMaterialChange(index, 'quantity', text)} keyboardType="numeric" dense />
              </View>
            </LineRow>
          ))}
        </CostSection>

        <CostSection title="Custom items" count={customItems.length} subtotal={customTotal} empty="Nothing custom yet. Describe it below and add it.">
          {customItems.map((line, index) => (
            <LineRow key={`custom-${index}`} name={line.description} total={parseFloat(line.price || '0')} onRemove={() => onRemoveCustomItem(index)} />
          ))}
          <AddPanel>
            <View style={styles.addDescription}>
              <FieldCaption>Description</FieldCaption>
              <TextInput
                {...input}
                value={customItemInput.description}
                onChangeText={text => onCustomItemInputChange({ description: text })}
                placeholder="e.g. Permit fee"
                dense
              />
            </View>
            <View style={styles.addPrice}>
              <FieldCaption>Price</FieldCaption>
              <TextInput
                {...input}
                value={customItemInput.price}
                onChangeText={text => onCustomItemInputChange({ price: text })}
                keyboardType="numeric"
                placeholder="0.00"
                dense
                left={<TextInput.Affix text="$" />}
                onSubmitEditing={onAddCustomItem}
              />
            </View>
            <PrimaryButton label="Add item" onPress={onAddCustomItem} disabled={saving} />
          </AddPanel>
        </CostSection>

        <View style={styles.grandTotal}>
          <Text style={styles.grandTotalLabel}>{lineCount === 1 ? '1 line' : `${lineCount} lines`}</Text>
          <Text style={styles.grandTotalValue}>Total {money(grandTotal)}</Text>
        </View>

        <FormActions onSubmit={onSave} submitLabel="Save costs" submitting={saving} onCancel={onCancel} />
      </FormPanel>
    </ScrollView>
  );
}

export type SavedCostLine = {
  uid: string;
  description: string | null;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  type: 'labor' | 'material' | 'other' | string | null;
};

const savedLineTotal = (line: SavedCostLine) => Number(line.amount ?? (line.price ?? 0) * (line.quantity ?? 0)) || 0;

const GROUPS: { type: string; title: string; empty: string }[] = [
  { type: 'labor', title: 'Services', empty: 'No services on this job.' },
  { type: 'material', title: 'Materials', empty: 'No materials on this job.' },
  { type: 'other', title: 'Custom items', empty: 'No custom items on this job.' },
];

/** The saved cost lines of a job, grouped the same way the editor groups them. */
export function JobCostsList({
  lines,
  onEdit,
  onRemove,
  onAdd,
}: {
  lines: SavedCostLine[];
  onEdit: (line: SavedCostLine) => void;
  onRemove: (line: SavedCostLine) => void;
  onAdd: () => void;
}) {
  const { colors } = useAppTheme();
  const grandTotal = lines.reduce((sum, line) => sum + savedLineTotal(line), 0);

  if (lines.length === 0) {
    return (
      <FormPanel maxWidth={860}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No costs on this job yet</Text>
          <Text style={styles.emptyHint}>Add the services, materials and anything else you spend on it to track what it costs you.</Text>
          <PrimaryButton label="Add costs" onPress={onAdd} />
        </View>
      </FormPanel>
    );
  }

  return (
    <FormPanel maxWidth={860}>
      {GROUPS.map(group => {
        const rows = lines.filter(line => (line.type ?? 'other') === group.type);
        if (rows.length === 0) return null;
        const subtotal = rows.reduce((sum, line) => sum + savedLineTotal(line), 0);
        return (
          <CostSection key={group.type} title={group.title} count={rows.length} subtotal={subtotal} empty={group.empty}>
            {rows.map(line => (
              <View key={line.uid} style={styles.savedRow}>
                <View style={styles.savedText}>
                  <Text style={styles.lineName} numberOfLines={2}>{line.description || 'Untitled'}</Text>
                  {group.type !== 'other' ? (
                    <Text style={styles.savedMeta}>
                      {money(line.price ?? 0)} × {line.quantity ?? 0}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.lineTotal}>{money(savedLineTotal(line))}</Text>
                <IconButton icon="pencil-outline" size={18} onPress={() => onEdit(line)} accessibilityLabel={`Edit ${line.description || 'cost'}`} style={styles.lineRemove} iconColor={colors.muted} />
                <IconButton icon="trash-can-outline" size={18} onPress={() => onRemove(line)} accessibilityLabel={`Remove ${line.description || 'cost'}`} style={styles.lineRemove} iconColor={st.danger} />
              </View>
            ))}
          </CostSection>
        );
      })}
      <View style={styles.grandTotal}>
        <Text style={styles.grandTotalLabel}>{lines.length === 1 ? '1 line' : `${lines.length} lines`}</Text>
        <Text style={styles.grandTotalValue}>Total {money(grandTotal)}</Text>
      </View>
    </FormPanel>
  );
}

function CostSection({
  title,
  count,
  subtotal,
  action,
  empty,
  children,
}: {
  title: string;
  count: number;
  subtotal: number;
  action?: ReactNode;
  empty: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {count > 0 ? <Text style={styles.sectionMeta}>{count} · {money(subtotal)}</Text> : null}
        </View>
        {action}
      </View>
      {count === 0 ? <Text style={styles.empty}>{empty}</Text> : null}
      {children}
    </View>
  );
}

function LineRow({ name, total, onRemove, children }: { name: string; total: number; onRemove: () => void; children?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <Text style={styles.lineName} numberOfLines={2}>{name}</Text>
        <Text style={styles.lineTotal}>{money(total)}</Text>
        <IconButton icon="close" size={18} onPress={onRemove} accessibilityLabel={`Remove ${name}`} style={styles.lineRemove} iconColor={colors.muted} />
      </View>
      {children ? <View style={styles.lineFields}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: formLayoutTheme.border,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexShrink: 1 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: formLayoutTheme.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionMeta: { fontSize: 12.5, color: st.faint },
  empty: { fontSize: 13, color: st.faint, marginBottom: 12 },
  line: {
    borderWidth: 1,
    borderColor: formLayoutTheme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: formLayoutTheme.background,
  },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineName: { flex: 1, fontSize: 14, fontWeight: '600', color: st.text },
  lineTotal: { fontSize: 14, fontWeight: '600', color: st.text, fontVariant: ['tabular-nums'] },
  lineRemove: { margin: -6 },
  lineFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  field: { flexGrow: 1, flexBasis: 160 },
  fieldNarrow: { flexGrow: 0, flexBasis: 110 },
  addDescription: { flexGrow: 1, flexBasis: 220 },
  addPrice: { flexGrow: 0, flexBasis: 140 },
  grandTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: st.softBg,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: st.rowBorder,
  },
  savedText: { flex: 1 },
  savedMeta: { fontSize: 12.5, color: st.muted, marginTop: 2 },
  emptyState: { alignItems: 'flex-start', gap: 8, paddingVertical: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: st.text },
  emptyHint: { fontSize: 13.5, color: st.muted, lineHeight: 20, marginBottom: 8, maxWidth: 520 },
  grandTotalLabel: { fontSize: 13, color: st.muted },
  grandTotalValue: { fontSize: 17, fontWeight: '700', color: st.text },
});
