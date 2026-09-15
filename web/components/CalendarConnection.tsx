import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text, Button, Snackbar, ActivityIndicator, Dialog, Portal } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// HT-1: connect the signed-in user's Google Calendar through Nylas hosted
// auth, so the jobs they create are pushed to their own calendar.
//
// The heavy lifting is in the calendar-connect edge function; this component
// only starts the flow, completes it when the browser comes back with
// ?code=&state=, and shows the connection state read from email_integrations
// (row-level security lets a user read their own row only).

type Connection = {
  provider: string;
  email: string | null;
  status: 'active' | 'revoked';
};

// Where Nylas sends the browser after consent. Must be registered as a
// callback URI on the Nylas application (see supabase/README.md).
const RETURN_PATH = '/schedule';

const getRedirectUri = () =>
  Platform.OS === 'web'
    ? `${window.location.origin}${RETURN_PATH}`
    : Linking.createURL(RETURN_PATH);

// supabase-js reports a non-2xx as a generic message; the function's
// { error } body is on error.context. Same pattern as the invoice send.
async function invokeConnect<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('calendar-connect', { body });
  if (error) {
    let reason = error.message;
    try {
      const parsed = await error.context?.json();
      if (parsed?.error) reason = parsed.error;
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new Error(reason);
  }
  return data as T;
}

const providerLabel = (provider: string) =>
  provider === 'google' ? 'Google Calendar'
  : provider === 'microsoft' ? 'Outlook Calendar'
  : 'Calendar';

export default function CalendarConnection() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string }>();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // The callback params are handled exactly once, even though expo-router
  // may re-render with them still present until replace() lands.
  const exchangedCode = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .select('provider, email, status')
        .maybeSingle();
      if (error) throw error;
      setConnection((data as Connection) ?? null);
    } catch (error: any) {
      console.error('Error reading calendar connection:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const finishConnect = useCallback(async (code: string, state: string) => {
    setBusy(true);
    try {
      const result = await invokeConnect<{ email: string | null; provider: string }>({
        action: 'exchange',
        code,
        state,
      });
      setSnackbar(
        result.email
          ? `${providerLabel(result.provider)} connected as ${result.email}`
          : `${providerLabel(result.provider)} connected`,
      );
      await load();
    } catch (error: any) {
      setSnackbar(error.message || 'Could not connect the calendar');
    } finally {
      setBusy(false);
    }
  }, [load]);

  // Web: the browser comes back to /schedule?code=...&state=... after consent.
  useEffect(() => {
    const code = typeof params.code === 'string' ? params.code : null;
    const state = typeof params.state === 'string' ? params.state : null;
    if (!code || !state || exchangedCode.current === code) return;
    exchangedCode.current = code;

    // Drop the one-time code from the address bar before anything else, so a
    // reload does not try to redeem it again.
    router.replace(RETURN_PATH);
    finishConnect(code, state);
  }, [params.code, params.state, router, finishConnect]);

  const connect = async () => {
    setBusy(true);
    try {
      const redirectUri = getRedirectUri();
      const { url } = await invokeConnect<{ url: string }>({
        action: 'start',
        redirectUri,
        provider: 'google',
      });

      if (Platform.OS === 'web') {
        // Same tab: the flow returns here and the effect above completes it.
        window.location.assign(url);
        return;
      }

      // Native: consent opens in an auth session that closes when the
      // provider redirects to our deep link.
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      if (result.type === 'success') {
        const { queryParams } = Linking.parse(result.url);
        const code = queryParams?.code;
        const state = queryParams?.state;
        if (typeof code === 'string' && typeof state === 'string') {
          await finishConnect(code, state);
          return;
        }
      }
      setBusy(false);
    } catch (error: any) {
      setSnackbar(error.message || 'Could not start the calendar connection');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setConfirmDisconnect(false);
    setBusy(true);
    try {
      await invokeConnect<{ ok: boolean }>({ action: 'disconnect' });
      setSnackbar('Calendar disconnected');
      await load();
    } catch (error: any) {
      setSnackbar(error.message || 'Could not disconnect the calendar');
    } finally {
      setBusy(false);
    }
  };

  const renderStatus = () => {
    if (loading) {
      return <ActivityIndicator size="small" />;
    }
    if (!connection) {
      return (
        <Text style={styles.statusText}>
          Google Calendar not connected. Jobs you create will not appear in your calendar.
        </Text>
      );
    }
    if (connection.status === 'revoked') {
      return (
        <Text style={[styles.statusText, styles.warningText]}>
          {providerLabel(connection.provider)} access was removed
          {connection.email ? ` for ${connection.email}` : ''}. Reconnect to keep syncing jobs.
        </Text>
      );
    }
    return (
      <Text style={styles.statusText}>
        {providerLabel(connection.provider)} connected
        {connection.email ? ` as ${connection.email}` : ''}.
      </Text>
    );
  };

  const renderActions = () => {
    if (loading) return null;
    if (!connection) {
      return (
        <Button mode="outlined" compact onPress={connect} loading={busy} disabled={busy}>
          Connect Google Calendar
        </Button>
      );
    }
    return (
      <View style={styles.actions}>
        {connection.status === 'revoked' && (
          <Button mode="contained" compact onPress={connect} loading={busy} disabled={busy}>
            Reconnect
          </Button>
        )}
        <Button
          mode="text"
          compact
          onPress={() => setConfirmDisconnect(true)}
          disabled={busy}
          textColor="#b00020"
        >
          Disconnect
        </Button>
      </View>
    );
  };

  return (
    <View style={styles.bar}>
      <MaterialIcons
        name="event-available"
        size={20}
        color={connection?.status === 'active' ? '#2e7d32' : '#777'}
        style={styles.icon}
      />
      <View style={styles.statusContainer}>{renderStatus()}</View>
      {renderActions()}

      <Portal>
        <Dialog visible={confirmDisconnect} onDismiss={() => setConfirmDisconnect(false)}>
          <Dialog.Title>Disconnect calendar?</Dialog.Title>
          <Dialog.Content>
            <Text>
              New jobs will stop appearing in your calendar. Events already created are left as they are.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDisconnect(false)}>Cancel</Button>
            <Button onPress={disconnect} textColor="#b00020">Disconnect</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbar !== null}
        onDismiss={() => setSnackbar(null)}
        duration={4000}
      >
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  icon: {
    marginRight: 4,
  },
  statusContainer: {
    flex: 1,
    minWidth: 200,
  },
  statusText: {
    fontSize: 14,
    color: '#444',
  },
  warningText: {
    color: '#b26a00',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
