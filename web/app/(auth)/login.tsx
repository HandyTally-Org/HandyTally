import { useEffect, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { styles as globalStyles } from '../../styles';

// Update the logo source paths to match the correct location and filename
let logoSource;
try {
  // Try the assets folder with correct filename
  logoSource = require('../../assets/handytally-logo.png');
} catch (e) {
  try {
    // Try with hyphen
    logoSource = require('../../assets/handy-tally-logo.png');
  } catch (e) {
    try {
      // Try without hyphen
      logoSource = require('../../assets/handytallylogo.png');
    } catch (e) {
      // Fallback to a URL if all else fails
      logoSource = { uri: 'https://i.imgur.com/Ixu6WiQ.png' };
      console.warn('Could not find logo image file, using fallback URL');
    }
  }
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, tenant, accessDenied, session, isLoading, membershipLoaded } = useAuth();
  const router = useRouter();

  // Someone who already has a session does not belong on the login page: a
  // reload, the back button, or a lost navigation race (the pre-#54 bundle)
  // could all leave a signed-in user staring at the login form. Wait for the
  // membership check on customer hosts so a non-member is signed out (with
  // the accessDenied message) instead of bounced into the app.
  useEffect(() => {
    if (isLoading || !session) return;
    if (tenant.status === 'loading') return;
    if (tenant.status === 'found' && !membershipLoaded) return;
    router.replace('/');
  }, [isLoading, session, tenant.status, membershipLoaded, router]);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // HT-12: roles come from organization_memberships via AuthContext now;
      // the `users` table this used to write to never existed.
      await signIn(email, password);
      router.replace('/');
    } catch (err) {
      console.error('Login error:', err);
      
      if (err.message.includes('Email not confirmed')) {
        setError('Please check your email and confirm your account before logging in.');
      } else if (err.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(`Login failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        {/* Logo only, no title */}
        <View style={styles.logoContainer}>
          <Image
            source={logoSource}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>
            {/* HT-38: on a customer subdomain the hostname names the organisation. */}
            {tenant.status === 'found' ? `Sign in to ${tenant.organization.name}` : 'Sign in to your account'}
          </Text>
        </View>
        
        {(error ?? accessDenied) && <Text style={styles.error}>{error ?? accessDenied}</Text>}
        
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        
        <Button 
          mode="contained" 
          onPress={handleLogin} 
          loading={loading}
          disabled={loading}
          style={styles.button}
        >
          Sign In
        </Button>
        
        {/* HT-30: password reset. */}
        <View style={styles.footer}>
          <Link href="/(auth)/forgot-password">
            <Text style={styles.link}>Forgot password?</Text>
          </Link>
        </View>

        {/* HT-38: members of a customer organisation are invited by its admin, not self-registered. */}
        {tenant.status !== 'found' && (
        <View style={styles.footer}>
          <Text>Don't have an account? </Text>
          <Link href="/(auth)/signup">
            <Text style={styles.link}>Sign up</Text>
          </Link>
        </View>
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
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 200,
    height: 200 * 0.75, // Maintain aspect ratio
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 24,
  },
  footer: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'center',
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