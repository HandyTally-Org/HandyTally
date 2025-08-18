import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Dimensions } from 'react-native';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';
import { COLORS, SPACING, FONT_SIZES, BREAKPOINTS } from '../utils/constants';
import {supabase} from "@/services/supabase";

export const LoginScreen: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();

    const handleLogin = async (e?: any) => {
        // Prevent form submission if called from form
        if (e?.preventDefault) {
            e.preventDefault();
        }

        if (!email.trim() || !password.trim()) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }

        setLoading(true);
        try {
            const { error } = await signIn(email, password);
            if (error) {
                Alert.alert('Login Failed', error.message);
            }
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const screenWidth = Dimensions.get('window').width;
    const isMobile = screenWidth < BREAKPOINTS.mobile;

    // Memoize the platform check to prevent re-renders
    const isWeb = useMemo(() => typeof window !== 'undefined', []);

    // Test in your login screen
    const testDB = async () => {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .limit(1);

            console.log('DB Test:', { data, error });
            alert(`DB Test: ${data ? 'Success!' : 'Failed: ' + error?.message}`);
        } catch (err) {
            console.error('DB Error:', err);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={[styles.container, isMobile && styles.mobileContainer]}>
                <View style={[styles.content, isMobile && styles.mobileContent]}>
                    <Text style={styles.title}>Admin Login</Text>
                    <Text style={styles.subtitle}>Sign in to access the admin panel</Text>

                    <Card style={[styles.formCard, isMobile && styles.mobileFormCard]}>
                        <View style={{ width: '100%' }}>
                            <Input
                                label="Email"
                                value={email}
                                onChangeText={setEmail}
                                placeholder="admin@example.com"
                                type="email"
                                error={!email.includes('@') && email.length > 0 ? 'Please enter a valid email' : ''}
                                autoComplete="email"
                            />

                            <Input
                                label="Password"
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Enter your password"
                                secureTextEntry
                                type="password"
                                autoComplete="current-password"
                            />

                            <Button
                                title="Sign In"
                                onPress={handleLogin}
                                loading={loading}
                                style={styles.loginButton}
                                fullWidth
                            />
                        </View>
                        {/*<Button title="Test DB" onPress={testDB} />*/}
                    </Card>
                </View>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollContainer: {
        flexGrow: 1,
        minHeight: '100vh' as any,
    },
    container: {
        flex: 1,
        backgroundColor: COLORS.gray100,
        justifyContent: 'center',
        paddingHorizontal: SPACING.lg,
    },
    mobileContainer: {
        paddingHorizontal: SPACING.md,
    },
    content: {
        maxWidth: 400,
        alignSelf: 'center',
        width: '100%',
    },
    mobileContent: {
        maxWidth: '100%',
    },
    title: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: 'bold',
        color: COLORS.gray900,
        textAlign: 'center',
        marginBottom: SPACING.sm,
    },
    subtitle: {
        fontSize: FONT_SIZES.md,
        color: COLORS.gray500,
        textAlign: 'center',
        marginBottom: SPACING.xl,
    },
    formCard: {
        marginBottom: SPACING.lg,
    },
    mobileFormCard: {
        marginHorizontal: 0,
    },
    loginButton: {
        marginTop: SPACING.md,
    },
});