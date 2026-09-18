import { ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { formTheme, inputStyle } from './FormDialog';
import { themed } from '../constants/Colors';
import { useAppTheme } from '../contexts/ThemeContext';

// HT-60: the pieces of a full-page edit form (Client Details, Job Details)
// share their look with FormDialog and the Settings editors: a bordered
// white panel with a max width, small uppercase section headings, quiet
// outlined inputs with a dark focus ring and a dark primary button.

// HT-68: style-only tokens (CSS variable references); see the note on
// formTheme in FormDialog.tsx.
export const formLayoutTheme = {
  ...formTheme,
  inputBorder: themed.line,
  focusBorder: themed.text,
  placeholder: themed.faint,
  secondaryText: themed.muted,
};

/**
 * Props for a Paper TextInput in a modernised form: outlined, 8px radius, a
 * focus ring in the text colour. A hook, because outlineColor and
 * activeOutlineColor are parsed by Paper and need real hex for the active
 * theme; spread the result the same way as the old constant.
 */
export function useOutlinedInputProps() {
  const { colors } = useAppTheme();
  return {
    mode: 'outlined',
    outlineColor: colors.line,
    activeOutlineColor: colors.text,
    outlineStyle: { borderRadius: 8 },
    style: inputStyle,
  } as const;
}

type FormPanelProps = {
  /** Heading at the top of the panel. */
  title?: string;
  subtitle?: string;
  maxWidth?: number;
  children: ReactNode;
};

/** The card a full-page form sits in; stops it stretching edge to edge on a wide screen. */
export function FormPanel({ title, subtitle, maxWidth = 720, children }: FormPanelProps) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  return (
    <View style={[styles.panel, { maxWidth }, compact && styles.panelCompact]}>
      {title ? (
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>{title}</Text>
          {subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

type FormSectionProps = {
  title: string;
  /** One line under the heading saying what the group is for. */
  description?: string;
  children: ReactNode;
};

/** A group of related fields under a small uppercase heading. */
export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

type FormActionsProps = {
  onSubmit: () => void;
  submitLabel: string;
  submitting?: boolean;
  /** Omit for a form with no cancel (the Client Details form saves in place). */
  onCancel?: () => void;
  cancelLabel?: string;
};

/** The footer row: an outlined cancel and the dark primary button, right-aligned. */
export function FormActions({ onSubmit, submitLabel, submitting = false, onCancel, cancelLabel = 'Cancel' }: FormActionsProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.actions}>
      {onCancel ? (
        <Button
          mode="outlined"
          onPress={onCancel}
          disabled={submitting}
          textColor={colors.muted}
          style={styles.secondaryButton}
        >
          {cancelLabel}
        </Button>
      ) : null}
      <Button
        mode="contained"
        onPress={onSubmit}
        loading={submitting}
        disabled={submitting}
        buttonColor={colors.primary}
        textColor={colors.onPrimary}
        style={styles.primaryButton}
      >
        {submitLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    alignSelf: 'flex-start',
    backgroundColor: formLayoutTheme.background,
    borderWidth: 1,
    borderColor: formLayoutTheme.border,
    borderRadius: 12,
    padding: 24,
  },
  panelCompact: {
    padding: 16,
  },
  panelHeader: {
    marginBottom: 20,
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: formLayoutTheme.text,
  },
  panelSubtitle: {
    fontSize: 13,
    color: formLayoutTheme.mutedText,
    marginTop: 2,
  },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    paddingBottom: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: formLayoutTheme.border,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: formLayoutTheme.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionDescription: {
    fontSize: 13,
    color: formLayoutTheme.mutedText,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: formLayoutTheme.border,
  },
  primaryButton: {
    borderRadius: 8,
  },
  secondaryButton: {
    borderRadius: 8,
    borderColor: formLayoutTheme.inputBorder,
  },
});
