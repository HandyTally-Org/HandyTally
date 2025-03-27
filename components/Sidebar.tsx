import { View, StyleSheet, Image, ScrollView, Text, Pressable, TouchableOpacity } from 'react-native';
import { Button, Icon } from 'react-native-paper';
import { Link, usePathname } from 'expo-router';
import { supabase } from '../lib/api';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import handyTallyLogo from '../assets/handytally-logo.png';
import { useAuth } from '../contexts/AuthContext';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const [logoUrl, setLogoUrl] = useState('https://i.imgur.com/Ixu6WiQ.png'); // Default logo
  const [adminExpanded, setAdminExpanded] = useState(false);

  useEffect(() => {
    // Fetch logo URL from company table
    const fetchLogoUrl = async () => {
      try {
        const { data, error } = await supabase
          .from('company')
          .select('logo_url')
          .single();
        
        if (data && !error && data.logo_url) {
          setLogoUrl(data.logo_url);
        }
      } catch (error) {
        console.error("Error fetching logo:", error);
      }
    };

    fetchLogoUrl();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const isActive = (path: string) => {
    if (path === '/admin/company') {
      // Only check for the company.tsx path
      return pathname === '/admin/company';
    }
    return pathname === path;
  };

  const navigateTo = (path: string) => {
    router.push(path);
  };

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', href: '/' },
    { label: 'Clients', icon: 'people', href: '/clients' },
    { label: 'Jobs', icon: 'work', href: '/jobs' },
    { label: 'Calendar', icon: 'calendar-today', href: '/calendar' },
    { label: 'Invoices', icon: 'receipt', href: '/invoices' },
    { label: 'Inventory', icon: 'inventory', href: '/inventory' },
    // ... other items
  ];

  return (
    <View style={{ backgroundColor: '#ffffff' }}>
      <Image 
        source={{ uri: logoUrl }} 
        style={styles.logo} 
        resizeMode="contain"
      />
      
      <Image
        source={handyTallyLogo}
        style={styles.titleLogo}
        resizeMode="contain"
      />
      
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.nav}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} asChild>
              <Button 
                mode={pathname === item.href ? 'contained' : 'text'} 
                style={styles.navButton}
                contentStyle={styles.buttonContent}
                labelStyle={[styles.buttonLabel, pathname === item.href ? styles.selectedButtonLabel : styles.unselectedButtonLabel]}
                icon={({size}) => (
                  <MaterialCommunityIcons 
                    name={item.icon} 
                    size={size} 
                    color={pathname === item.href ? 'white' : 'black'} 
                  />
                )}
                buttonColor={pathname === item.href ? '#444444' : undefined}
                textColor={pathname === item.href ? 'white' : 'black'}
              >
                {item.label}
              </Button>
            </Link>
          ))}
          
          <Link href="/services" asChild>
            <Button 
              mode={pathname === '/services' ? 'contained' : 'text'} 
              style={styles.navButton}
              contentStyle={styles.buttonContent}
              labelStyle={[styles.buttonLabel, pathname === '/services' ? styles.selectedButtonLabel : styles.unselectedButtonLabel]}
              icon={({size}) => (
                <MaterialCommunityIcons 
                  name="hammer" 
                  size={size} 
                  color={pathname === '/services' ? 'white' : 'black'} 
                />
              )}
              buttonColor={pathname === '/services' ? '#444444' : undefined}
              textColor={pathname === '/services' ? 'white' : 'black'}
            >
              Labor
            </Button>
          </Link>
          
          {/* Admin dropdown section */}
          <View style={styles.adminSection}>
            <Pressable 
              style={[
                styles.navItem, 
                adminExpanded && styles.expandedNavItem
              ]}
              onPress={() => setAdminExpanded(!adminExpanded)}
            >
              <MaterialIcons 
                name="settings" 
                size={24} 
                color={adminExpanded ? '#333333' : '#333333'} 
                style={styles.navIcon}
              />
              <Text 
                style={[
                  styles.navLabel, 
                ]}
              >
                Admin
              </Text>
              <MaterialIcons 
                name={adminExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                size={24} 
                color={'#333333'} 
                style={{ marginLeft: 'auto' }}
              />
            </Pressable>
            
            {adminExpanded && (
              <View style={styles.subMenu}>
                <Pressable
                  style={[
                    styles.navItem, 
                    pathname === '/admin/company' && styles.darkGrayNavItem,
                    styles.subNavItem
                  ]}
                  onPress={() => navigateTo('/admin/company')}
                >
                  <MaterialIcons 
                    name="business" 
                    size={24} 
                    color={pathname === '/admin/company' ? '#ffffff' : '#333333'} 
                    style={[styles.navIcon, styles.subNavIcon]}
                  />
                  <Text style={[
                    styles.navLabel, 
                    pathname === '/admin/company' && styles.activeNavLabel
                  ]}>
                    Company
                  </Text>
                </Pressable>
                
                <Pressable
                  style={[
                    styles.navItem, 
                    isActive('/admin/users') && styles.darkGrayNavItem,
                    styles.subNavItem
                  ]}
                  onPress={() => navigateTo('/admin/users')}
                >
                  <MaterialIcons 
                    name="people" 
                    size={24} 
                    color={isActive('/admin/users') ? '#ffffff' : '#333333'} 
                    style={[styles.navIcon, styles.subNavIcon]}
                  />
                  <Text style={[
                    styles.navLabel, 
                    isActive('/admin/users') && styles.activeNavLabel
                  ]}>
                    Users
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
          
          <TouchableOpacity 
            style={[styles.navButton, isActive('/schedule') && styles.activeNavButton]} 
            onPress={() => navigateTo('/schedule')}
          >
            <MaterialIcons name="schedule" size={24} color={isActive('/schedule') ? 'white' : 'black'} />
            <Text style={[styles.navButtonLabel, isActive('/schedule') && styles.selectedButtonLabel]}>Schedule</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.navButton, isActive('/inventory') && styles.activeNavButton]} 
            onPress={() => navigateTo('/inventory')}
          >
            <MaterialIcons name="inventory" size={24} color={isActive('/inventory') ? 'white' : 'black'} />
            <Text style={[styles.navButtonLabel, isActive('/inventory') && styles.selectedButtonLabel]}>Inventory</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      <View style={styles.signOutContainer}>
        <Button 
          mode="outlined" 
          onPress={signOut}
          style={styles.signOutButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
          icon={({size}) => (
            <MaterialCommunityIcons name="logout" size={size} color="black" />
          )}
          textColor="black"
        >
          Sign Out
        </Button>
      </View>
    </View>
  );
}

// Custom navigation item component
function NavItem({ icon, label, isActive, onPress, isSubItem = false }) {
  return (
    <Pressable
      style={[
        styles.navItem, 
        isActive && styles.activeNavItem,
        isSubItem && styles.subNavItem
      ]}
      onPress={onPress}
    >
      <MaterialIcons 
        name={icon} 
        size={24} 
        color={isActive ? '#ffffff' : '#333333'} 
        style={[styles.navIcon, isSubItem && styles.subNavIcon]}
      />
      <Text style={[styles.navLabel, isActive && styles.activeNavLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 250,
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  logo: {
    height: 145,
    width: 235,
    marginBottom: 8,
    alignSelf: 'center',
  },
  titleLogo: {
    height: 60,
    width: 200,
    marginBottom: 24,
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  scrollContainer: {
    flex: 1,
  },
  nav: {
    gap: 8,
    alignItems: 'flex-start',
    paddingBottom: 16,
  },
  navButton: {
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    paddingLeft: 8,
    width: '100%',
  },
  buttonContent: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '100%',
  },
  buttonLabel: {
    textAlign: 'left',
    marginLeft: 16,
  },
  selectedButtonLabel: {
    color: 'white',
  },
  unselectedButtonLabel: {
    color: 'black',
  },
  signOutContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  signOutButton: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    paddingLeft: 8,
    borderColor: '#444444',
  },
  adminSection: {
    marginTop: 8,
  },
  subMenu: {
    marginLeft: 16,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
  },
  expandedNavItem: {
    backgroundColor: '#f0f0f0',
  },
  navIcon: {
    marginRight: 12,
  },
  navLabel: {
    fontSize: 16,
    color: '#333333',
  },
  activeNavLabel: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  subNavItem: {
    paddingLeft: 24,
  },
  subNavIcon: {
    marginRight: 8,
    fontSize: 20,
  },
  darkGrayNavItem: {
    backgroundColor: '#444444',
  },
  activeNavButton: {
    backgroundColor: '#444444',
  },
  navButtonLabel: {
    marginLeft: 16,
  },
}); 