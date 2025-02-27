import { useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { Link } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { styles as globalStyles } from '../../styles';
import { supabase } from '../../lib/supabase';

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
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('Attempting login with:', { email });
      
      // First, try to sign in with the provided credentials
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      
      // Check if the user exists in our custom users table
      if (data.user) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('uid', data.user.id)
          .single();
        
        if (userError && userError.code !== 'PGRST116') {
          console.error('Error fetching user data:', userError);
        }
        
        // If the user doesn't exist in our custom table, add them
        if (!userData) {
          const { error: insertError } = await supabase
            .from('users')
            .insert([{
              uid: data.user.id,
              email: data.user.email,
              name: '',
              role: 'user', // Default role
              created_at: new Date().toISOString()
            }]);
          
          if (insertError) {
            console.error('Error adding user to custom table:', insertError);
          }
        }
      }
      
      // Successful login - let the AuthContext handle the rest
      console.log('Login successful:', data);
      await signIn(email, password);
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
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>
        
        {error && <Text style={styles.error}>{error}</Text>}
        
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
        
        <View style={styles.footer}>
          <Text>Don't have an account? </Text>
          <Link href="/(auth)/signup">
            <Text style={styles.link}>Sign up</Text>
          </Link>
        </View>
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