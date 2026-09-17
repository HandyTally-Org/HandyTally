import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { BASE_DOMAIN } from '../../lib/tenant';

// HT-30: request a password-reset email. The app never had this screen, so
// "Forgot password" was impossible from the UI even before SMTP was fixed.
//
// The link in the email must come back to the host the user started from
// (wgelectricus.handytally.com, not the apex), so the current origin is passed
// as redirectTo; GoTrue accepts it because *.handytally.com is on the
// redirect allow list (HT-39). The /set-password page already knows how to
// consume the recovery fragment (HT-12).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const address = email.trim();
    if (!EMAIL_RE.test(address)) {
      setError('Please enter a valid email address');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const origin =
        typeof window !== 'undefined' && window.location
          ? window.location.origin
          : `https://${BASE_DOMAIN}`;
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${origin}/set-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      console.error('Password reset request failed:', err);
      setError(`Could not send the reset email: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>Reset your password</Text>

        {sent ? (
          <>
            <Text style={styles.body}>
              If an account exists for {email.trim()}, a reset link is on its way. Open it on this
              device to choose a new password.
            </Text>
            <View style={styles.footer}>
              <Link href="/(auth)/login">
                <Text style={styles.link}>Back to sign in</Text>
              </Link>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Enter your email address and we'll send you a link to choose a new password.
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            <Button
              mode="contained"
              onPress={handleSend}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Send reset link
            </Button>

            <View style={styles.footer}>
              <Link href="/(auth)/login">
                <Text style={styles.link}>Back to sign in</Text>
              </Link>
            </View>
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
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginBottom: 16,
  },
  error: {
    color: '#b00020',
    marginBottom: 12,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  link: {
    color: '#1976d2',
    fontWeight: '500',
  },
});
