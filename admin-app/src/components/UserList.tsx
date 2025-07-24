import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Card } from './ui/Card';
import { UserProfile } from '../types';
import { COLORS, SPACING, FONT_SIZES } from '../utils/constants';

interface UserListProps {
    users: UserProfile[];
    onUserPress?: (user: UserProfile) => void;
    loading?: boolean;
}

export const UserList: React.FC<UserListProps> = ({
                                                      users,
                                                      onUserPress,
                                                      loading = false,
                                                  }) => {
    const renderUser = ({ item: user }: { item: UserProfile }) => (
        <TouchableOpacity
            style={styles.userItem}
            onPress={() => onUserPress?.(user)}
            disabled={!onUserPress}
        >
            <View style={styles.userInfo}>
                <Text style={styles.userName}>
                    {user.first_name && user.last_name
                        ? `${user.first_name} ${user.last_name}`
                        : user.email}
                </Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                {user.organization && (
                    <Text style={styles.userOrg}>{user.organization.name}</Text>
                )}
            </View>
            <View style={styles.userMeta}>
                <View style={[styles.roleBadge, styles[`role${user.role}`]]}>
                    <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
                </View>
                <View style={[styles.statusDot, user.is_active ? styles.active : styles.inactive]} />
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <Card>
                <Text style={styles.loadingText}>Loading users...</Text>
            </Card>
        );
    }

    if (users.length === 0) {
        return (
            <Card>
                <Text style={styles.emptyText}>No users found</Text>
            </Card>
        );
    }

    return (
        <Card>
            <FlatList
                data={users}
                renderItem={renderUser}
                keyExtractor={(user) => user.id}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                showsVerticalScrollIndicator={false}
            />
        </Card>
    );
};

const styles = StyleSheet.create({
    userItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: SPACING.sm,
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
        color: COLORS.gray900,
        marginBottom: 2,
    },
    userEmail: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.gray500,
        marginBottom: 2,
    },
    userOrg: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.gray400,
    },
    userMeta: {
        alignItems: 'flex-end',
    },
    roleBadge: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: SPACING.xs,
    },
    roleuser: {
        backgroundColor: COLORS.gray200,
    },
    roleadmin: {
        backgroundColor: '#FEF3C7',
    },
    rolesuperuser: {
        backgroundColor: '#DBEAFE',
    },
    roleText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '600',
        color: COLORS.gray700,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    active: {
        backgroundColor: COLORS.success,
    },
    inactive: {
        backgroundColor: COLORS.gray300,
    },
    separator: {
        height: 1,
        backgroundColor: COLORS.gray200,
        marginVertical: SPACING.xs,
    },
    loadingText: {
        textAlign: 'center',
        color: COLORS.gray500,
        fontSize: FONT_SIZES.md,
    },
    emptyText: {
        textAlign: 'center',
        color: COLORS.gray500,
        fontSize: FONT_SIZES.md,
    },
});