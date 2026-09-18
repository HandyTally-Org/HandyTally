import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Snackbar, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// HT-75: a shared, in-app replacement for window.alert()/confirm(). Applied
// first to InvoiceDetails' send/print/delete flow; HT-85 swept the remaining
// alert()/confirm() call sites onto it and gave the dialog its look (HT-84).
//
// Split into a provider (the context + state) and a host (the actual
// Snackbar/Dialog UI) because react-native-paper's Portal.Host renders
// portaled content as a *sibling* of the app tree, not a descendant of it
// (see PaperProvider.tsx: <PortalHost><children/></PortalHost>, and
// PortalHost itself renders <View>{children}</View><PortalManager/> side by
// side). Most Dialogs in this app -- including InvoiceDetails, which this
// ticket targets -- render through <Portal>, so a provider mounted anywhere
// inside the normal app tree (e.g. inside (app)/_layout.tsx's Drawer) would
// never be visible to them. FeedbackProvider is mounted once above
// PaperProvider instead (app/_layout.tsx), so its context reaches both
// branches; FeedbackHost is mounted once inside the Paper tree
// ((app)/_layout.tsx) so its own <Portal> has a Portal.Host ancestor to find.

export type FeedbackTone = 'success' | 'error' | 'info';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tints the confirm button red, for a delete or other destructive action. */
  destructive?: boolean;
  /** A MaterialCommunityIcons name for the badge above the title; defaults by `destructive`. */
  icon?: string;
};

type FeedbackContextValue = {
  /** A Snackbar toast; replaces alert(). */
  notify: (message: string, tone?: FeedbackTone) => void;
  /** A Paper confirm dialog; replaces confirm(). Resolves true/false on the user's choice. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

type FeedbackUiState = {
  snackbar: { message: string; tone: FeedbackTone } | null;
  confirmState: ConfirmOptions | null;
};

type FeedbackUiContextValue = {
  state: FeedbackUiState;
  dismissSnackbar: () => void;
  settleConfirm: (value: boolean) => void;
};

// Internal: the raw state FeedbackHost renders, kept separate from
// FeedbackContext so a component only needing notify()/confirm() doesn't
// re-render on every snackbar/dialog state change.
const FeedbackUiContext = createContext<FeedbackUiContextValue | null>(null);

const TONE_COLOR: Record<FeedbackTone, string> = {
  success: '#2e7d32',
  error: '#c62828',
  info: '#323232',
};

// HT-85: the same notify()/confirm() for code that is not a component
// (utils/excel.ts's import prompt). The provider registers itself on mount;
// before that -- or on a screen rendered outside the app shell -- the
// browser's own dialogs stand in so nothing is silently swallowed.
let bridge: FeedbackContextValue | null = null;

export const feedback: FeedbackContextValue = {
  notify: (message, tone) => {
    if (bridge) bridge.notify(message, tone);
    else if (typeof window !== 'undefined') window.alert(message);
  },
  confirm: options => {
    if (bridge) return bridge.confirm(options);
    if (typeof window !== 'undefined') return Promise.resolve(window.confirm(`${options.title}\n\n${options.message}`));
    return Promise.resolve(false);
  },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FeedbackUiState>({ snackbar: null, confirmState: null });
  // The confirm() promise's resolver, parked here between asking and the user's tap.
  const resolveConfirm = useRef<((value: boolean) => void) | null>(null);

  const notify = useCallback((message: string, tone: FeedbackTone = 'info') => {
    setState(current => ({ ...current, snackbar: { message, tone } }));
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      // A second ask while one is open answers the first with "no".
      resolveConfirm.current?.(false);
      resolveConfirm.current = resolve;
      setState(current => ({ ...current, confirmState: options }));
    });
  }, []);

  const dismissSnackbar = useCallback(() => {
    setState(current => ({ ...current, snackbar: null }));
  }, []);

  const settleConfirm = useCallback((value: boolean) => {
    setState(current => ({ ...current, confirmState: null }));
    resolveConfirm.current?.(value);
    resolveConfirm.current = null;
  }, []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);
  const uiValue = useMemo(() => ({ state, dismissSnackbar, settleConfirm }), [state, dismissSnackbar, settleConfirm]);

  useEffect(() => {
    bridge = value;
    return () => {
      if (bridge === value) bridge = null;
    };
  }, [value]);

  return (
    <FeedbackContext.Provider value={value}>
      <FeedbackUiContext.Provider value={uiValue}>{children}</FeedbackUiContext.Provider>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within a FeedbackProvider');
  return ctx;
}

const DANGER = '#dc2626';
const DANGER_SOFT = 'rgba(220, 38, 38, 0.12)';
const ACCENT = '#2563eb';
const ACCENT_SOFT = 'rgba(37, 99, 235, 0.12)';

/** Renders the actual Snackbar/confirm Dialog. Mount once, inside the Paper tree. */
export function FeedbackHost() {
  const ctx = useContext(FeedbackUiContext);
  const theme = useTheme();
  if (!ctx) return null;
  const { state, dismissSnackbar, settleConfirm } = ctx;
  const ask = state.confirmState;
  const destructive = !!ask?.destructive;
  const accent = destructive ? DANGER : ACCENT;
  const icon = ask?.icon ?? (destructive ? 'trash-can-outline' : 'help-circle-outline');

  return (
    <Portal>
      <Snackbar
        visible={!!state.snackbar}
        onDismiss={dismissSnackbar}
        duration={4000}
        style={state.snackbar ? { backgroundColor: TONE_COLOR[state.snackbar.tone] } : undefined}
      >
        {state.snackbar?.message ?? ''}
      </Snackbar>

      {/* HT-84: one confirm look for the whole app -- an icon badge, a
          centred title and message, an outlined Cancel and a filled action
          that goes red for a delete. */}
      <Dialog visible={!!ask} onDismiss={() => settleConfirm(false)} style={styles.dialog}>
        <Dialog.Content style={styles.content}>
          <View style={[styles.badge, { backgroundColor: destructive ? DANGER_SOFT : ACCENT_SOFT }]}>
            <MaterialCommunityIcons name={icon as any} size={28} color={accent} />
          </View>
          <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
            {ask?.title}
          </Text>
          <Text variant="bodyMedium" style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>
            {ask?.message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button mode="outlined" onPress={() => settleConfirm(false)} style={styles.button} textColor={theme.colors.onSurface}>
            {ask?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            mode="contained"
            onPress={() => settleConfirm(true)}
            style={styles.button}
            buttonColor={destructive ? DANGER : theme.colors.primary}
            textColor={destructive ? '#ffffff' : theme.colors.onPrimary}
          >
            {ask?.confirmLabel ?? 'OK'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
    minWidth: 320,
    maxWidth: 420,
    alignSelf: 'center',
  },
  content: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 8,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    textAlign: 'center',
    lineHeight: 21,
  },
  actions: {
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  button: {
    flex: 1,
    borderRadius: 8,
  },
});
