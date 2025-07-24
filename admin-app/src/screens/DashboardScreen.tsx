import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useUsers } from '../hooks/useUsers';
import { useOrganizations } from '../hooks/useOrganizations';
import { COLORS, SPACING, FONT_SIZES } from '../utils/constants';

export const DashboardScreen: React.FC = () => {
    const { user, signOut, isSuperuser } = useAuth();
    const { users } = useUsers();
    const { organizations } = useOrganizations();

    const handleSignOut = async () => {
        await signOut();
    };

    const stats = [
        {
            title: 'Total Users',
            value: users.length,
            color: COLORS.primary,
        },
        {
            title: 'Organizations',
            value: organizations.length,
            color: COLORS.success,
        },
        {
            title: 'Active Orgs',
            value: organizations.filter(org => org.status === 'active').length,
            color: COLORS.warning,
        },
    ];

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.welcomeText}>
                    Welcome, {user?.first_name || user?.email}
                </Text>
                <Text style={styles.roleText}>Role: {user?.role}</Text>
            </View>

            {isSuperuser && (
                <View style={styles.statsContainer}>
                    {stats.map((stat, index) => (
                        <Card key={index} style={[styles.statCard, { borderLeftColor: stat.color }]}>
                            <Text style={styles.statValue}>{stat.value}</Text>
                            <Text style={styles.statTitle}>{stat.title}</Text>
                        </Card>
                    ))}
                </View>
            )}

            <Card>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                {isSuperuser && (
                    <>
                        <Button
                            title="Manage Users"
                            onPress={() => {/* Navigate to users */}}
                            style={styles.actionButton}
                            variant="secondary"
                        />
                        <Button
                            title="Manage Organizations"
                            onPress={() => {/* Navigate to organizations */}}
                            style={styles.actionButton}
                            variant="secondary"
                        />
                    </>
                )}
                <Button
                    title="Sign Out"
                    onPress={handleSignOut}
                    style={styles.actionButton}
                    variant="danger"
                />
            </Card>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.gray100,
        padding: SPACING.lg,
    },
    header: {
        marginBottom: SPACING.xl,
    },
    welcomeText: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: COLORS.gray900,
        marginBottom: SPACING.xs,
    },
    roleText: {
        fontSize: FONT_SIZES.md,
        color: COLORS.gray500,
        textTransform: 'capitalize',
    },
    statsContainer: {
        marginBottom: SPACING.lg,
    },
    statCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderLeftWidth: 4,
        paddingLeft: SPACING.lg,
    },
    statValue: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: 'bold',
        color: COLORS.gray900,
    },
    statTitle: {
        fontSize: FONT_SIZES.md,
        color: COLORS.gray500,
    },
    sectionTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: '600',
        color: COLORS.gray900,
        marginBottom: SPACING.lg,
    },
    actionButton: {
        marginBottom: SPACING.md,
    },
});