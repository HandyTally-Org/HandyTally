import { Children, ReactNode } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Portal, Dialog, Button, Text, IconButton, HelperText } from 'react-native-paper';
import { themed } from '../constants/Colors';
import { useAppTheme } from '../contexts/ThemeContext';

// The popup used by every add/edit form. Paper's Dialog stretches to the window
// on web, so this pins it to a card-sized width, rounds the corners and gives
// each form the same header, scrolling body and footer.

// HT-68: these are CSS-variable references (see constants/Colors.ts) and are
// only for *styles*. A Paper colour prop (textColor, iconColor, buttonColor,
// outlineColor) is parsed by the `color` package and throws on var(); those
// read hex from useAppTheme().colors instead.
export const formTheme = {
  background: themed.panel,
  border: themed.line,
  text: themed.text,
  mutedText: themed.muted,
};

/** Style for a Paper TextInput inside a FormField. */
export const inputStyle = { backgroundColor: formTheme.background } as const;

type FormDialogProps = {
  visible: boolean;
  title: string;
  /** One line under the title saying what the form is for. */
  subtitle?: string;
  onDismiss: () => void;
  /** Buttons pinned below the scrolling body; usually a FormDialogFooter. */
  footer: ReactNode;
  maxWidth?: number;
  children: ReactNode;
};

export function FormDialog({ visible, title, subtitle, onDismiss, footer, maxWidth = 520, children }: FormDialogProps) {
  const { width, height } = useWindowDimensions();
  const { colors } = useAppTheme();
  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={[styles.dialog, { width: Math.min(maxWidth, width - 32) }]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <IconButton icon="close" size={20} onPress={onDismiss} iconColor={colors.muted} accessibilityLabel="Close" />
        </View>
        <ScrollView
          style={{ maxHeight: Math.max(240, height * 0.65) }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </Dialog>
    </Portal>
  );
}

type FormDialogFooterProps = {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting?: boolean;
};

export function FormDialogFooter({ onCancel, onSubmit, submitLabel, submitting = false }: FormDialogFooterProps) {
  const { colors } = useAppTheme();
  return (
    <>
      <Button mode="text" onPress={onCancel} disabled={submitting} textColor={colors.muted}>
        Cancel
      </Button>
      <Button mode="contained" onPress={onSubmit} loading={submitting} disabled={submitting} style={styles.submitButton}>
        {submitLabel}
      </Button>
    </>
  );
}

/** One input plus its error line, spaced like every other field. */
export function FormField({ label, error, children }: { label?: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {children}
      {error ? (
        <HelperText type="error" visible padding="none">
          {error}
        </HelperText>
      ) : null}
    </View>
  );
}

/** Fields side by side on a wide screen, stacked on a narrow one. */
export function FormRow({ children, weights }: { children: ReactNode; weights?: number[] }) {
  const { width } = useWindowDimensions();
  const stacked = width < 480;
  return (
    <View style={stacked ? styles.rowStacked : styles.row}>
      {Children.map(children, (child, index) =>
        child ? <View style={stacked ? undefined : [styles.rowItem, weights?.[index] != null && { flex: weights[index] }]}>{child}</View> : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: 'center',
    marginHorizontal: 0,
    borderRadius: 14,
    backgroundColor: formTheme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 8,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerText: {
    flex: 1,
    paddingTop: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: formTheme.text,
  },
  subtitle: {
    fontSize: 13,
    color: formTheme.mutedText,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: formTheme.border,
  },
  submitButton: {
    borderRadius: 8,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: themed.muted,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowStacked: {
    flexDirection: 'column',
  },
  rowItem: {
    flex: 1,
  },
});
