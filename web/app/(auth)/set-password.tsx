import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

// HT-12: where the invitation email lands. Also serves password resets.
//
// Two kinds of link arrive here:
//   /set-password?token_hash=<token>&type=invite     from invite-user; the
//       token is exchanged for a session with verifyOtp, no GoTrue redirect
//   /set-password#access_token=…&refresh_token=…&type=recovery
//       from Supabase's own password-reset email (the client is configured
//       with detectSessionInUrl: false, so the fragment is read here)
// A user who is already signed in may also open it to change their password.

const MIN_PASSWORD_LENGTH = 8;

type Stage = 'verifying' | 'ready' | 'invalid' | 'done';

export default function SetPasswordScreen() {
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('verifying');
  const [isInvite, setIsInvite] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const establishSession = async () => {
      const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : undefined;
      const type = (typeof params.type === 'string' ? params.type : 'invite') as EmailOtpType;

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (cancelled) return;
        if (error) {
          console.error('Could not verify the invitation link:', error);
          setStage('invalid');
          return;
        }
        setIsInvite(type === 'invite');
        setStage('ready');
        return;
      }

      const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
      const fragment = new URLSearchParams(hash);
      const accessToken = fragment.get('access_token');
      const refreshToken = fragment.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (error) {
          console.error('Could not use the reset link:', error);
          setStage('invalid');
          return;
        }
        window.history.replaceState(null, '', window.location.pathname);
        setStage('ready');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setStage(session ? 'ready' : 'invalid');
    };

    establishSession();
    return () => { cancelled = true; };
  }, [params.token_hash, params.type]);

  const handleSubmit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStage('done');
      router.replace('/');
    } catch (err: any) {
      console.error('Could not set the password:', err);
      setError(err.message || 'Could not set the password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        {stage === 'verifying' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.subtitle}>Checking your link...</Text>
          </View>
        )}

        {stage === 'invalid' && (
          <View style={styles.centered}>
            <Text style={styles.title}>This link is not valid</Text>
            <Text style={styles.subtitle}>
              It may have been used already or expired. Ask your administrator to send a new invitation.
            </Text>
            <Link href="/(auth)/login">
              <Text style={styles.link}>Go to sign in</Text>
            </Link>
          </View>
        )}

        {(stage === 'ready' || stage === 'done') && (
          <>
            <Text style={styles.title}>{isInvite ? 'Welcome to HandyTally' : 'Set a new password'}</Text>
            <Text style={styles.subtitle}>
              {isInvite ? 'Choose a password to finish setting up your account.' : 'Choose your new password.'}
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              style={styles.input}
            />
            <TextInput
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              style={styles.input}
              onSubmitEditing={handleSubmit}
            />

            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={saving}
              disabled={saving || stage === 'done'}
              style={styles.button}
            >
              {isInvite ? 'Set password and sign in' : 'Save password'}
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  centered: {
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  link: {
    color: '#2196F3',
  },
  error: {
    color: 'red',
    marginBottom: 16,
    textAlign: 'center',
  },
});
