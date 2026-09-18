import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import 'react-native-reanimated';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Drawer } from 'expo-router/drawer';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { ActivityIndicator } from 'react-native-paper';

import { AuthProvider } from '../contexts/AuthContext';
import { ThemeProvider, useAppTheme } from '../contexts/ThemeContext';
import { TenantGate } from '../components/TenantGate';
import { themed } from '../constants/Colors';
import { navigationThemeFor, paperThemeFor } from '../constants/paperTheme';
import '../styles/theme.css';
import '../styles/print.css';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// The session check for the (app) group lives in app/(app)/_layout.tsx (HT-12).

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
        <Ionicons name="log-out-outline" size={20} color={themed.text} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </DrawerContentScrollView>
  );
}

// HT-68: Paper and the navigation container take the organisation's theme
// from the ThemeProvider above; the same tokens feed the CSS variables that
// the hand-styled views read through `themed`, so both sides switch together.
function ThemedApp({ isServer }: { isServer: boolean }) {
  const { scheme, colors } = useAppTheme();
  const paperTheme = useMemo(() => paperThemeFor(scheme), [scheme]);
  const navigationTheme = useMemo(() => navigationThemeFor(scheme), [scheme]);

  return (
      <PaperProvider theme={paperTheme}>
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: themed.bg }}>
            {/* HT-38: unknown customer subdomains stop here. */}
            <TenantGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: themed.bg },
              }}
            >
        <NavigationThemeProvider value={navigationTheme}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                {!isServer && (
                  <Drawer
                    drawerContent={(props) => <CustomDrawerContent {...props} />}
                    screenOptions={{
                      headerShown: false,
                      drawerStyle: { backgroundColor: themed.panel },
                      drawerActiveBackgroundColor: colors.active,
                      drawerActiveTintColor: colors.text,
                      drawerInactiveTintColor: colors.text,
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
                    {/* HT-10: public landing page for the Approve button in
                        estimate emails. Not a drawer destination. */}
                    <Drawer.Screen
                      name="approve"
                      options={{
                        drawerLabel: () => null,
                        title: 'Approve estimate',
                        drawerItemStyle: { height: 0 },
                      }}
                    />
                  </Drawer>
                )}
          {isServer && <Slot />}
        </NavigationThemeProvider>
            </Stack>
            </TenantGate>
          </View>
        </SafeAreaProvider>
      </PaperProvider>
  );
}

export default function RootLayout() {
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
      <ThemeProvider>
        <ThemedApp isServer={isServer} />
      </ThemeProvider>
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
    borderTopColor: themed.line,
  },
  signOutText: {
    marginLeft: 10,
    fontSize: 16,
    color: themed.text,
  },
  footerContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: themed.line,
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
    color: themed.text,
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
    color: themed.muted,
  },
  divider: {
    fontSize: 12,
    color: themed.muted,
    marginHorizontal: 4,
  },
  copyrightText: {
    fontSize: 12,
    color: themed.muted,
    marginBottom: 2,
  },
  versionText: {
    fontSize: 12,
    color: themed.muted,
  },
});
