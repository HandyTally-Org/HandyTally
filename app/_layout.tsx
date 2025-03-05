import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import 'react-native-reanimated';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Drawer } from 'expo-router/drawer';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { ActivityIndicator } from 'react-native-paper';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import '../styles/print.css';
import { usePathname } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Create a custom theme with dark gray primary color
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#444444',
    onPrimary: 'white',
    primaryContainer: '#444444',
    onPrimaryContainer: 'white',
  },
};

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Redirect to the sign-in page if not authenticated
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Redirect to the home page if authenticated
      router.replace('/(app)');
    }
  }, [session, segments, isLoading]);

  return <Slot />;
}

// Custom drawer content component
function CustomDrawerContent(props: any) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetchLogo();
  }, []);

  const fetchLogo = async () => {
    try {
      // Try to get logo from company settings
      const { data, error } = await supabase
        .from('company')
        .select('logo_url')
        .single();

      if (data && data.logo_url) {
        setLogoUrl(data.logo_url);
      }
    } catch (error) {
      console.error('Error fetching logo:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flexGrow: 1 }}>
      {/* Company Logo at the top */}
      <View style={styles.logoContainer}>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" />
        ) : (
          <View style={styles.placeholderLogo}>
            <Text style={styles.placeholderText}>Your Company Logo</Text>
          </View>
        )}
      </View>

      {/* Main navigation items */}
      <View style={styles.drawerContent}>
        <DrawerItemList {...props} />
      </View>

      {/* Footer with HandyTally logo and info */}
      <View style={styles.footerContainer}>
        <View style={styles.handyTallyLogoContainer}>
          <View style={styles.iconPlaceholder}>
            <Text style={styles.iconText}>HT</Text>
          </View>
          <Text style={styles.handyTallyText}>HandyTally</Text>
        </View>
        
        <View style={styles.footerTextContainer}>
          <View style={styles.termsRow}>
            <TouchableOpacity onPress={() => Linking.openURL('https://handytally.com/terms')}>
              <Text style={styles.termsText}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.divider}>|</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://handytally.com/privacy')}>
              <Text style={styles.termsText}>Privacy</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.copyrightText}>© HandyTally</Text>
          <Text style={styles.versionText}>v1.0</Text>
        </View>
      </View>

      {/* Sign Out button at the very bottom */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#333" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </DrawerContentScrollView>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded, error] = useFonts({
    // Add your custom fonts here
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  // Only render the app if we're in a browser environment
  const isServer = typeof window === 'undefined';
  
  return (
    <AuthProvider>
      <PaperProvider theme={theme}>
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#ffffff' },
              }}
            >
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
                {!isServer && (
                  <Drawer
                    drawerContent={(props) => <CustomDrawerContent {...props} />}
                    screenOptions={{
                      headerShown: false,
                      drawerActiveBackgroundColor: '#e6e6e6',
                      drawerActiveTintColor: '#333',
                      drawerInactiveTintColor: '#333',
                      drawerLabelStyle: {
                        marginLeft: -20,
                        fontSize: 16,
                      },
                    }}
                  >
                    <Drawer.Screen
                      name="(app)"
                      options={{
                        drawerLabel: 'Dashboard',
                        title: 'Dashboard',
                        drawerIcon: ({ color }) => <Ionicons name="grid-outline" size={22} color={color} />,
                      }}
                    />
                    <Drawer.Screen
                      name="login"
                      options={{
                        drawerLabel: () => null,
                        title: undefined,
                        drawerItemStyle: { height: 0 },
                      }}
                    />
                    <Drawer.Screen
                      name="register"
                      options={{
                        drawerLabel: () => null,
                        title: undefined,
                        drawerItemStyle: { height: 0 },
                      }}
                    />
                    <Drawer.Screen
                      name="reset-password"
                      options={{
                        drawerLabel: () => null,
                        title: undefined,
                        drawerItemStyle: { height: 0 },
                      }}
                    />
                  </Drawer>
                )}
          {isServer && <Slot />}
        </ThemeProvider>
            </Stack>
          </View>
        </SafeAreaProvider>
      </PaperProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
  },
  logo: {
    width: '80%',
    height: '80%',
  },
  placeholderLogo: {
    width: '80%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'white',
    textAlign: 'center',
  },
  drawerContent: {
    flex: 1,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  signOutText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  footerContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'center',
  },
  handyTallyLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconPlaceholder: {
    width: 30,
    height: 30,
    backgroundColor: '#4169E1',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  iconText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  handyTallyLogo: {
    width: 30,
    height: 30,
    marginRight: 8,
  },
  handyTallyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  footerTextContainer: {
    alignItems: 'center',
  },
  termsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  termsText: {
    fontSize: 12,
    color: '#666',
  },
  divider: {
    fontSize: 12,
    color: '#666',
    marginHorizontal: 4,
  },
  copyrightText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  versionText: {
    fontSize: 12,
    color: '#666',
  },
});
