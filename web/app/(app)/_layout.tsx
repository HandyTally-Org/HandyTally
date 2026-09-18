import { Drawer } from 'expo-router/drawer';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useState, useEffect, useMemo } from 'react';
import {supabase} from "@/lib/supabase";
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../contexts/ThemeContext';
import { FeedbackHost } from '../../contexts/FeedbackContext';
import { UpdateToast } from '../../components/UpdateToast';
import { VersionBadge } from '../../components/VersionBadge';
import { themed } from '../../constants/Colors';
import { NAV_ITEMS } from '../../constants/navigation';
import { applyNavSettings } from '../../constants/organizationSettings';

// Custom drawer content component
function CustomDrawerContent(props: any) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [submenuOpen, setSubmenuOpen] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const pathname = usePathname();
  // HT-12: only organisation admins (and superusers) see the Admin section.
  // HT-50: the organisation's saved order and hidden entries apply to every
  // member; the routes themselves stay registered below whatever is hidden.
  const { isAdmin, settings } = useAuth();
  const navItems = useMemo(() => applyNavSettings(NAV_ITEMS, settings.nav), [settings.nav]);

  // Function to toggle drawer state
  const toggleDrawer = () => {
    setIsCollapsed(!isCollapsed);
  };

  const toggleSubmenu = (key: string) => {
    setSubmenuOpen(open => ({ ...open, [key]: !open[key] }));
  };

  // Check if a path is active (exact match)
  const isPathActive = (path: string) => {
    if (path === '/') {
      return pathname === '/' || pathname === '/index';
    }
    return pathname === path;
  };

  // Check if a path is part of the current route (for parent routes)
  const isPathPartOfRoute = (path: string) => {
    return pathname.startsWith(path) && path !== '/';
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

  // Open a submenu when one of its pages is reached by URL.
  useEffect(() => {
    for (const item of NAV_ITEMS) {
      if (item.children && pathname.startsWith(`${item.route}/`) && !submenuOpen[item.key]) {
        setSubmenuOpen(open => ({ ...open, [item.key]: true }));
      }
    }
  }, [pathname]);

  return (
    <View style={{ flex: 1, backgroundColor: themed.panel }}>
      {/* Header with toggle button */}
      <View style={styles.drawerHeader}>
        <TouchableOpacity onPress={toggleDrawer} style={styles.toggleButton}>
          <Ionicons name={isCollapsed ? "menu" : "menu-outline"} size={24} color={themed.text} />
        </TouchableOpacity>
        </View>

      <DrawerContentScrollView {...props} contentContainerStyle={{ flexGrow: 1 }}>
        {/* HT-48: every entry comes from constants/navigation.ts */}
        {/* HT-68: each glyph carries its module's hue (item.color); the active
            row stays a neutral fill, so the coloured icon is the accent. */}
        <View style={styles.drawerContent}>
          {navItems.map(item => {
            if (item.adminOnly && !isAdmin) return null;
            const active = isPathActive(item.route);
            const children = item.children;
            const expanded = !!children && (submenuOpen[item.key] || isPathPartOfRoute(`${item.route}/`));
            return (
              <View key={item.key}>
                <TouchableOpacity
                  onPress={() => (children ? toggleSubmenu(item.key) : router.push(item.route as any))}
                  style={[
                    styles.drawerItem,
                    active && styles.drawerItemFocused,
                    isCollapsed && styles.drawerItemCollapsed
                  ]}
                >
                  <View style={styles.drawerItemIcon}>
                    <Ionicons name={item.icon} size={24} color={themed[item.color]} />
                  </View>
                  {!isCollapsed && (
                    children ? (
                      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.drawerItemLabel, active && styles.drawerItemLabelFocused]}>
                          {item.label}
                        </Text>
                        <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={themed.muted} />
                      </View>
                    ) : (
                      <Text style={[styles.drawerItemLabel, active && styles.drawerItemLabelFocused]}>
                        {item.label}
                      </Text>
                    )
                  )}
                </TouchableOpacity>

                {children && expanded && (
                  <View style={[styles.submenu, isCollapsed && styles.submenuCollapsed]}>
                    {children.map(child => {
                      const childActive = isPathActive(child.route);
                      return (
                        <TouchableOpacity
                          key={child.key}
                          onPress={() => router.push(child.route as any)}
                          style={[
                            styles.submenuItem,
                            childActive && styles.submenuItemFocused,
                            isCollapsed && styles.submenuItemCollapsed
                          ]}
                        >
                          <View style={[styles.submenuItemIcon, isCollapsed && { marginRight: 0 }]}>
                            <Ionicons name={child.icon} size={20} color={themed[child.color]} />
                          </View>
                          {!isCollapsed && (
                            <Text style={[styles.submenuItemLabel, childActive && styles.submenuItemLabelFocused]}>
                              {child.label}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Add the HandyTally logo at the bottom */}
        <View style={[styles.footerContainer, isCollapsed && styles.footerContainerCollapsed]}>
          <View style={styles.handyTallyLogoContainer}>
            <Image
              source={require('../../assets/favicon-32x32.png')}
              style={styles.handyTallyLogo}
              resizeMode="contain"
            />
            {!isCollapsed && (
              <Text style={styles.handyTallyText}>HandyTally</Text>
            )}
      </View>

          {!isCollapsed && (
            <View style={styles.footerTextContainer}>
              <View style={styles.termsRow}>
                <Text style={styles.termsText}>Terms</Text>
                <Text style={styles.divider}>|</Text>
                <Text style={styles.termsText}>Privacy</Text>
              </View>
              <Text style={styles.copyrightText}>© HandyTally</Text>
              {/* HT-41: version and channel of this host, links to /whats-new */}
              <VersionBadge />
                {/* Sign Out button at the very bottom */}
                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                    <Ionicons name="log-out-outline" size={20} color={themed.text} />
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
          )}
      </View>
      </DrawerContentScrollView>
    </View>
  );
}

export default function AppLayout() {
  // HT-12: the (app) group needs a session. Nothing enforced this before; a
  // signed-out visitor got every screen with empty data.
  const { session, isLoading, membershipLoaded, tenant } = useAuth();
  const { colors } = useAppTheme();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace('/(auth)/login');
    }
  }, [isLoading, session, router]);

  if (isLoading || !session) {
    return null;
  }

  // HT-38: on a customer host, wait for the membership check so a non-member
  // never sees another organisation's screens before being signed out.
  if (tenant.status === 'found' && !membershipLoaded) {
    return null;
  }

  return (
    <>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'permanent',
          // HT-68: the scene behind every screen follows the theme (React
          // Navigation would otherwise paint its light default under any
          // screen that does not cover the full height).
          sceneStyle: { backgroundColor: themed.bg },
          drawerStyle: {
            width: 'auto', // This will be controlled by our custom component
            backgroundColor: themed.panel,
            borderRightColor: themed.line,
          },
          drawerActiveBackgroundColor: colors.active,
          drawerActiveTintColor: colors.text,
          drawerInactiveTintColor: colors.text,
          drawerLabelStyle: {
            marginLeft: -20,
            fontSize: 16,
          },
        }}
      >
        {/* HT-48: one registration per nav entry; submenu pages are routable but hidden from the default list. */}
        {NAV_ITEMS.map(item => (
          <Drawer.Screen
            key={item.key}
            name={item.screen}
            options={{
              drawerLabel: item.label,
              title: item.label,
              drawerIcon: ({ color }) => <Ionicons name={item.icon} size={22} color={color} />,
            }}
          />
        ))}
        {NAV_ITEMS.flatMap(item => item.children ?? []).map(child => (
          <Drawer.Screen
            key={child.key}
            name={child.screen}
            options={{
              drawerLabel: () => null,
              title: child.label,
              drawerItemStyle: { height: 0 },
            }}
          />
        ))}
      </Drawer>
      {/* HT-75: the notify()/confirm() UI. FeedbackProvider itself lives in
          the root layout, above PaperProvider -- see contexts/FeedbackContext.tsx. */}
      <FeedbackHost />
      {/* HT-41: one-time "Updated to vX.Y.Z" after a promote */}
      <UpdateToast />
    </>
  );
}

const styles = StyleSheet.create({
  drawerHeader: {
    height: 60,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: themed.line,
    backgroundColor: themed.panel,
  },
  toggleButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
  drawerContent: {
    flex: 1,
    backgroundColor: themed.panel,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: themed.panel,
  },
  drawerItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  drawerItemFocused: {
    backgroundColor: themed.active,
  },
  drawerItemIcon: {
    marginRight: 16,
    width: 24,
    alignItems: 'center',
  },
  drawerItemLabel: {
    fontSize: 16,
    color: themed.text,
  },
  drawerItemLabelFocused: {
    fontWeight: 'bold',
  },
  submenu: {
    marginLeft: 16,
    backgroundColor: themed.panel,
  },
  submenuCollapsed: {
    marginLeft: 0,
  },
  submenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: themed.panel,
  },
  submenuItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  submenuItemFocused: {
    backgroundColor: themed.active,
  },
  submenuItemIcon: {
    marginRight: 16,
    width: 20,
    alignItems: 'center',
  },
  submenuItemLabel: {
    fontSize: 14,
    color: themed.text,
  },
  submenuItemLabelFocused: {
    fontWeight: 'bold',
  },
  footerContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: themed.line,
    marginTop: 20,
    backgroundColor: themed.panel,
  },
  footerContainerCollapsed: {
    alignItems: 'center',
    padding: 8,
  },
  handyTallyLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  handyTallyLogo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  iconText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
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
