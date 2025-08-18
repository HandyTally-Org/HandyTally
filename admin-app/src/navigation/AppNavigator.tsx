// src/navigation/AppNavigator.tsx
import React, { useMemo, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { OrganizationsScreen } from '../screens/OrganizationsScreen';
import { useAuth } from '../hooks/useAuth';
import { COLORS, SPACING, FONT_SIZES, BREAKPOINTS } from '../utils/constants';

const Stack = createStackNavigator();

// Custom Top Navigation Component for Admin App
const TopNavigation = React.memo(({ navigation, route }: any) => {
    const { signOut, user } = useAuth();

    // Memoize the mobile check to prevent unnecessary re-renders
    const isMobile = useMemo(() => {
        const screenWidth = Dimensions.get('window').width;
        return screenWidth < BREAKPOINTS.mobile;
    }, []);

    // All navigation items for admin app - memoized to prevent recreation
    const navItems = useMemo(() => [
        { name: 'Dashboard', title: 'Dashboard' },
        { name: 'Users', title: 'Users' },
        { name: 'Organizations', title: 'Organizations' },
    ], []);

    const handleSignOut = useCallback(async () => {
        await signOut();
    }, [signOut]);

    const handleNavigation = useCallback((screenName: string) => {
        navigation.navigate(screenName);
    }, [navigation]);

    return (
        <View style={[styles.topNav, isMobile && styles.topNavMobile]}>
            {/* Left side - App title and navigation */}
            <View style={[styles.navLeft, isMobile && styles.navLeftMobile]}>
                <Text style={styles.appTitle}>Platform Admin</Text>
                <View style={styles.navItems}>
                    {navItems.map((item) => (
                        <TouchableOpacity
                            key={item.name}
                            style={[
                                styles.navItem,
                                route.name === item.name && styles.navItemActive,
                                isMobile && styles.navItemMobile
                            ]}
                            onPress={() => handleNavigation(item.name)}
                        >
                            <Text style={[
                                styles.navItemText,
                                route.name === item.name && styles.navItemTextActive
                            ]}>
                                {item.title}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Right side - Admin user info and logout */}
            <View style={[styles.navRight, isMobile && styles.navRightMobile]}>
                <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                        {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.email}
                    </Text>
                    <Text style={styles.userRole}>Platform Admin</Text>
                </View>
                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
});

TopNavigation.displayName = 'TopNavigation';

const AdminStack = React.memo(() => {
    // Memoize the screen options function to prevent recreation
    const screenOptions = useCallback(({ navigation, route }: any) => ({
        header: () => <TopNavigation navigation={navigation} route={route} />,
    }), []);

    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Users" component={UsersScreen} />
            <Stack.Screen name="Organizations" component={OrganizationsScreen} />
        </Stack.Navigator>
    );
});

AdminStack.displayName = 'AdminStack';

const LoadingScreen = React.memo(() => (
    <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Admin Panel...</Text>
    </View>
));

LoadingScreen.displayName = 'LoadingScreen';

export const AppNavigator: React.FC = () => {
    const { user, loading } = useAuth();

    // Memoize the screen options to prevent recreation
    const screenOptions = useMemo(() => ({ headerShown: false }), []);

    if (loading) {
        return <LoadingScreen />;
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={screenOptions}>
                {user ? (
                    <Stack.Screen name="AdminStack" component={AdminStack} />
                ) : (
                    <Stack.Screen name="Login" component={LoginScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.gray100,
    },
    loadingText: {
        marginTop: SPACING.md,
        fontSize: FONT_SIZES.md,
        color: COLORS.gray500,
    },

    // Top Navigation Styles
    topNav: {
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.gray200,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 60,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    topNavMobile: {
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        minHeight: 50,
    },

    // Left side navigation
    navLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: SPACING.xl,
    },
    navLeftMobile: {
        flex: 2,
        gap: SPACING.md,
    },
    appTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    navItems: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    navItem: {
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
        marginRight: SPACING.sm,
        borderRadius: 6,
        cursor: 'pointer' as any,
    },
    navItemMobile: {
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.xs,
        marginRight: SPACING.xs,
    },
    navItemActive: {
        backgroundColor: COLORS.primary,
    },
    navItemText: {
        fontSize: FONT_SIZES.md,
        fontWeight: '500',
        color: COLORS.gray700,
    },
    navItemTextActive: {
        color: COLORS.white,
    },

    // Right side user info
    navRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
    },
    navRightMobile: {
        flex: 1,
        justifyContent: 'flex-end',
        gap: SPACING.xs,
    },
    userInfo: {
        alignItems: 'flex-end',
    },
    userName: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
        color: COLORS.gray900,
    },
    userRole: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.gray500,
    },
    signOutButton: {
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        backgroundColor: COLORS.danger,
        borderRadius: 6,
        cursor: 'pointer' as any,
    },
    signOutText: {
        color: COLORS.white,
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
    },
});