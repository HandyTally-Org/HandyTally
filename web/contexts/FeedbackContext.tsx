import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Portal, Snackbar, Text } from 'react-native-paper';

// HT-75: a shared, in-app replacement for window.alert()/confirm(). Applied
// first to InvoiceDetails' send/print/delete flow; the ~50 other
// alert()/confirm() call sites across the app are a separate sweep.
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

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FeedbackUiState>({ snackbar: null, confirmState: null });
  // The confirm() promise's resolver, parked here between asking and the user's tap.
  const resolveConfirm = useRef<((value: boolean) => void) | null>(null);

  const notify = useCallback((message: string, tone: FeedbackTone = 'info') => {
    setState(current => ({ ...current, snackbar: { message, tone } }));
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
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

/** Renders the actual Snackbar/confirm Dialog. Mount once, inside the Paper tree. */
export function FeedbackHost() {
  const ctx = useContext(FeedbackUiContext);
  if (!ctx) return null;
  const { state, dismissSnackbar, settleConfirm } = ctx;

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

      <Dialog visible={!!state.confirmState} onDismiss={() => settleConfirm(false)}>
        <Dialog.Title>{state.confirmState?.title}</Dialog.Title>
        <Dialog.Content>
          <Text>{state.confirmState?.message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => settleConfirm(false)}>{state.confirmState?.cancelLabel ?? 'Cancel'}</Button>
          <Button onPress={() => settleConfirm(true)} textColor={state.confirmState?.destructive ? '#dc2626' : undefined}>
            {state.confirmState?.confirmLabel ?? 'OK'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
