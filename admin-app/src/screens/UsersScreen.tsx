import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { UserForm } from '../components/UserForm';
import { UserList } from '../components/UserList';
import { Button } from '../components/ui/Button';
import { useUsers } from '../hooks/useUsers';
import { useOrganizations } from '../hooks/useOrganizations';
import { useAuth } from '../hooks/useAuth';
import { COLORS, SPACING, FONT_SIZES } from '../utils/constants';

export const UsersScreen: React.FC = () => {
    const [showForm, setShowForm] = useState(false);
    const { users, loading: usersLoading, createUser } = useUsers();
    const { organizations } = useOrganizations();
    const { isSuperuser } = useAuth();

    if (!isSuperuser) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Access Denied: Superuser privileges required</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>User Management</Text>
                <Button
                    title={showForm ? 'Hide Form' : 'Add User'}
                    onPress={() => setShowForm(!showForm)}
                    style={styles.toggleButton}
                />
            </View>

            {showForm && (
                <UserForm
                    onSubmit={createUser}
                    organizations={organizations}
                    loading={usersLoading}
                />
            )}

            <Text style={styles.sectionTitle}>All Users ({users.length})</Text>
            <UserList users={users} loading={usersLoading} />
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.lg,
    },
    title: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: COLORS.gray900,
    },
    toggleButton: {
        minWidth: 100,
    },
    sectionTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: '600',
        color: COLORS.gray900,
        marginBottom: SPACING.md,
    },
    errorText: {
        fontSize: FONT_SIZES.md,
        color: COLORS.danger,
        textAlign: 'center',
        marginTop: SPACING.xl,
    },
});