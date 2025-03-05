import { Drawer } from 'expo-router/drawer';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useState, useEffect } from 'react';

// Custom drawer content component
function CustomDrawerContent(props: any) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [adminExpanded, setAdminExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  
  // Function to toggle drawer state
  const toggleDrawer = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Function to toggle admin submenu
  const toggleAdminSubmenu = () => {
    setAdminExpanded(!adminExpanded);
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

  // Auto-expand admin menu if on an admin page
  useEffect(() => {
    if (pathname.startsWith('/admin/') && !adminExpanded) {
      setAdminExpanded(true);
    }
  }, [pathname]);

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      {/* Header with toggle button */}
      <View style={styles.drawerHeader}>
        <TouchableOpacity onPress={toggleDrawer} style={styles.toggleButton}>
          <Ionicons name={isCollapsed ? "menu" : "menu-outline"} size={24} color="#333" />
        </TouchableOpacity>
      </View>
      
      <DrawerContentScrollView {...props} contentContainerStyle={{ flexGrow: 1 }}>
        {/* Custom drawer items with conditional rendering based on collapsed state */}
        <View style={styles.drawerContent}>
          {/* Dashboard */}
          <TouchableOpacity
            onPress={() => router.push('/')}
            style={[
              styles.drawerItem,
              isPathActive('/') && styles.drawerItemFocused,
              isCollapsed && styles.drawerItemCollapsed
            ]}
          >
            <View style={styles.drawerItemIcon}>
              <Ionicons name="grid-outline" size={24} color={isPathActive('/') ? '#333' : '#666'} />
            </View>
            {!isCollapsed && (
              <Text style={[
                styles.drawerItemLabel,
                isPathActive('/') && styles.drawerItemLabelFocused
              ]}>
                Dashboard
              </Text>
            )}
          </TouchableOpacity>

          {/* Clients */}
          <TouchableOpacity
            onPress={() => router.push('/clients')}
            style={[
              styles.drawerItem,
              isPathActive('/clients') && styles.drawerItemFocused,
              isCollapsed && styles.drawerItemCollapsed
            ]}
          >
            <View style={styles.drawerItemIcon}>
              <Ionicons name="people-outline" size={24} color={isPathActive('/clients') ? '#333' : '#666'} />
            </View>
            {!isCollapsed && (
              <Text style={[
                styles.drawerItemLabel,
                isPathActive('/clients') && styles.drawerItemLabelFocused
              ]}>
                Clients
              </Text>
            )}
          </TouchableOpacity>

          {/* Jobs */}
          <TouchableOpacity
            onPress={() => router.push('/jobs')}
            style={[
              styles.drawerItem,
              isPathActive('/jobs') && styles.drawerItemFocused,
              isCollapsed && styles.drawerItemCollapsed
            ]}
          >
            <View style={styles.drawerItemIcon}>
              <Ionicons name="briefcase-outline" size={24} color={isPathActive('/jobs') ? '#333' : '#666'} />
            </View>
            {!isCollapsed && (
              <Text style={[
                styles.drawerItemLabel,
                isPathActive('/jobs') && styles.drawerItemLabelFocused
              ]}>
                Jobs
              </Text>
            )}
          </TouchableOpacity>

          {/* Invoices */}
          <TouchableOpacity
            onPress={() => router.push('/invoices')}
            style={[
              styles.drawerItem,
              isPathActive('/invoices') && styles.drawerItemFocused,
              isCollapsed && styles.drawerItemCollapsed
            ]}
          >
            <View style={styles.drawerItemIcon}>
              <Ionicons name="document-text-outline" size={24} color={isPathActive('/invoices') ? '#333' : '#666'} />
            </View>
            {!isCollapsed && (
              <Text style={[
                styles.drawerItemLabel,
                isPathActive('/invoices') && styles.drawerItemLabelFocused
              ]}>
                Invoices
              </Text>
            )}
          </TouchableOpacity>

          {/* Labor */}
          <TouchableOpacity
            onPress={() => router.push('/labor')}
            style={[
              styles.drawerItem,
              isPathActive('/labor') && styles.drawerItemFocused,
              isCollapsed && styles.drawerItemCollapsed
            ]}
          >
            <View style={styles.drawerItemIcon}>
              <Ionicons name="hammer-outline" size={24} color={isPathActive('/labor') ? '#333' : '#666'} />
            </View>
            {!isCollapsed && (
              <Text style={[
                styles.drawerItemLabel,
                isPathActive('/labor') && styles.drawerItemLabelFocused
              ]}>
                Labor
              </Text>
            )}
          </TouchableOpacity>

          {/* Inventory */}
          <TouchableOpacity
            onPress={() => router.push('/inventory')}
            style={[
              styles.drawerItem,
              isPathActive('/inventory') && styles.drawerItemFocused,
              isCollapsed && styles.drawerItemCollapsed
            ]}
          >
            <View style={styles.drawerItemIcon}>
              <Ionicons name="cube-outline" size={24} color={isPathActive('/inventory') ? '#333' : '#666'} />
            </View>
            {!isCollapsed && (
              <Text style={[
                styles.drawerItemLabel,
                isPathActive('/inventory') && styles.drawerItemLabelFocused
              ]}>
                Inventory
              </Text>
            )}
          </TouchableOpacity>

          {/* Admin with submenu */}
          <View>
            <TouchableOpacity
              onPress={toggleAdminSubmenu}
              style={[
                styles.drawerItem,
                isPathActive('/admin') && styles.drawerItemFocused,
                isCollapsed && styles.drawerItemCollapsed
              ]}
            >
              <View style={styles.drawerItemIcon}>
                <Ionicons 
                  name="settings-outline" 
                  size={24} 
                  color={isPathActive('/admin') ? '#333' : '#666'} 
                />
              </View>
              {!isCollapsed && (
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[
                    styles.drawerItemLabel,
                    isPathActive('/admin') && styles.drawerItemLabelFocused
                  ]}>
                    Admin
                  </Text>
                  <Ionicons 
                    name={adminExpanded ? "chevron-down" : "chevron-forward"} 
                    size={16} 
                    color="#666" 
                  />
                </View>
              )}
            </TouchableOpacity>

            {/* Admin submenu items */}
            {(adminExpanded || isPathPartOfRoute('/admin/')) && (
              <View style={[
                styles.submenu,
                isCollapsed && styles.submenuCollapsed
              ]}>
                {/* Admin/Users */}
                <TouchableOpacity
                  onPress={() => router.push('/admin/users')}
                  style={[
                    styles.submenuItem,
                    isPathActive('/admin/users') && styles.submenuItemFocused,
                    isCollapsed && styles.submenuItemCollapsed
                  ]}
                >
                  <View style={[styles.submenuItemIcon, isCollapsed && { marginRight: 0 }]}>
                    <Ionicons name="people" size={20} color={isPathActive('/admin/users') ? '#333' : '#666'} />
                  </View>
                  {!isCollapsed && (
                    <Text style={[
                      styles.submenuItemLabel,
                      isPathActive('/admin/users') && styles.submenuItemLabelFocused
                    ]}>
                      Users
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Admin/Company */}
                <TouchableOpacity
                  onPress={() => router.push('/admin/company')}
                  style={[
                    styles.submenuItem,
                    isPathActive('/admin/company') && styles.submenuItemFocused,
                    isCollapsed && styles.submenuItemCollapsed
                  ]}
                >
                  <View style={[styles.submenuItemIcon, isCollapsed && { marginRight: 0 }]}>
                    <Ionicons name="business" size={20} color={isPathActive('/admin/company') ? '#333' : '#666'} />
                  </View>
                  {!isCollapsed && (
                    <Text style={[
                      styles.submenuItemLabel,
                      isPathActive('/admin/company') && styles.submenuItemLabelFocused
                    ]}>
                      Company
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
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
              <Text style={styles.versionText}>v1.0</Text>
            </View>
          )}
        </View>
      </DrawerContentScrollView>
    </View>
  );
}

export default function AppLayout() {
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'permanent',
        drawerStyle: {
          width: 'auto', // This will be controlled by our custom component
        },
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
        name="index"
        options={{
          drawerLabel: 'Dashboard',
          title: 'Dashboard',
          drawerIcon: ({ color }) => <Ionicons name="grid-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="clients"
        options={{
          drawerLabel: 'Clients',
          title: 'Clients',
          drawerIcon: ({ color }) => <Ionicons name="people-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="jobs"
        options={{
          drawerLabel: 'Jobs',
          title: 'Jobs',
          drawerIcon: ({ color }) => <Ionicons name="briefcase-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="invoices"
        options={{
          drawerLabel: 'Invoices',
          title: 'Invoices',
          drawerIcon: ({ color }) => <Ionicons name="document-text-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="labor"
        options={{
          drawerLabel: 'Labor',
          title: 'Labor',
          drawerIcon: ({ color }) => <Ionicons name="hammer-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="inventory"
        options={{
          drawerLabel: 'Inventory',
          title: 'Inventory',
          drawerIcon: ({ color }) => <Ionicons name="cube-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="admin"
        options={{
          drawerLabel: 'Admin',
          title: 'Admin',
          drawerIcon: ({ color }) => <Ionicons name="settings-outline" size={22} color={color} />,
        }}
      />
      {/* These screens are hidden in the drawer but still accessible via routes */}
      <Drawer.Screen
        name="admin/users"
        options={{
          drawerLabel: () => null,
          title: 'Users',
          drawerItemStyle: { height: 0 },
        }}
      />
      <Drawer.Screen
        name="admin/company"
        options={{
          drawerLabel: () => null,
          title: 'Company',
          drawerItemStyle: { height: 0 },
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  drawerHeader: {
    height: 60,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#ffffff',
  },
  toggleButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
  },
  drawerItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  drawerItemFocused: {
    backgroundColor: '#e6e6e6',
  },
  drawerItemIcon: {
    marginRight: 16,
    width: 24,
    alignItems: 'center',
  },
  drawerItemLabel: {
    fontSize: 16,
    color: '#333',
  },
  drawerItemLabelFocused: {
    fontWeight: 'bold',
  },
  submenu: {
    marginLeft: 16,
    backgroundColor: '#ffffff',
  },
  submenuCollapsed: {
    marginLeft: 0,
  },
  submenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
  },
  submenuItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  submenuItemFocused: {
    backgroundColor: '#e6e6e6',
  },
  submenuItemIcon: {
    marginRight: 16,
    width: 20,
    alignItems: 'center',
  },
  submenuItemLabel: {
    fontSize: 14,
    color: '#333',
  },
  submenuItemLabelFocused: {
    fontWeight: 'bold',
  },
  footerContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 20,
    backgroundColor: '#ffffff',
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