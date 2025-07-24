import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, Clipboard } from 'react-native';
import { OrganizationForm } from '../components/OrganizationForm';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useOrganizations } from '../hooks/useOrganizations';
import { useAuth } from '../hooks/useAuth';
import { Organization } from '../types';
import { COLORS, SPACING, FONT_SIZES } from '../utils/constants';

const BASE_DOMAIN = process.env.EXPO_PUBLIC_BASE_DOMAIN || 'yourdomain.com';
const VERCEL_TEAM_ID = process.env.EXPO_PUBLIC_VERCEL_TEAM_ID || 'dylangolows-projects';

export const OrganizationsScreen: React.FC = () => {
    const [showForm, setShowForm] = useState(false);
    const { organizations, loading, createOrganization, deleteOrganization } = useOrganizations();
    const { isSuperuser } = useAuth();

    if (!isSuperuser) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Access Denied: Superuser privileges required</Text>
            </View>
        );
    }

    const handleDeleteOrganization = (org: Organization) => {
        Alert.alert(
            'Delete Organization',
            `Are you sure you want to delete "${org.name}"?\n\nThis action cannot be undone and will permanently remove the organization from the database.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteOrganization(org.id);
                            Alert.alert('Success', 'Organization deleted successfully');
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete organization');
                        }
                    }
                }
            ]
        );
    };

    const openUrl = async (url: string, label: string) => {
        try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
                await Linking.openURL(url);
            } else {
                Alert.alert('Error', `Cannot open ${label}`);
            }
        } catch (error) {
            Alert.alert('Error', `Failed to open ${label}`);
        }
    };

    const copyToClipboard = async (text: string, label: string) => {
        try {
            await Clipboard.setString(text);
            Alert.alert('Copied!', `${label} copied to clipboard`);
        } catch (error) {
            Alert.alert('Error', `Failed to copy ${label}`);
        }
    };

    const getVercelProjectUrl = (projectId: string) => {
        return `https://vercel.com/${VERCEL_TEAM_ID}/${projectId}`;
    };

    const getDeploymentUrl = (org: Organization) => {
        if (org.vercel_deployment_url) {
            return org.vercel_deployment_url;
        }
        if (org.vercel_project_id) {
            return `https://${org.vercel_project_id}.vercel.app`;
        }
        return null;
    };

    const renderOrganization = (org: Organization) => (
        <Card key={org.id} style={styles.orgCard}>
            <View style={styles.orgHeader}>
                <Text style={styles.orgName}>{org.name}</Text>
                <View style={styles.headerActions}>
                    <View style={[styles.statusBadge, styles[`status${org.status}`]]}>
                        <Text style={styles.statusText}>{org.status.toUpperCase()}</Text>
                    </View>
                    {org.status === 'inactive' && (
                        <TouchableOpacity
                            onPress={() => handleDeleteOrganization(org)}
                            style={styles.deleteButton}
                        >
                            <Text style={styles.deleteIcon}>🗑️</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <Text style={styles.orgSubdomain}>{org.subdomain}.{BASE_DOMAIN}</Text>
            {org.domain && <Text style={styles.orgDomain}>Domain: {org.domain}</Text>}

            <View style={styles.orgMeta}>
                <Text style={styles.metaText}>
                    Created: {new Date(org.created_at).toLocaleDateString()}
                </Text>

                {/* Vercel Project Link */}
                {org.vercel_project_id && (
                    <View style={styles.urlRow}>
                        <Text style={styles.urlLabel}>Vercel Project:</Text>
                        <View style={styles.urlContainer}>
                            <TouchableOpacity
                                onPress={() => openUrl(getVercelProjectUrl(org.vercel_project_id!), 'Vercel Project')}
                                style={styles.urlTextContainer}
                            >
                                <Text style={styles.urlText} numberOfLines={1}>
                                    {getVercelProjectUrl(org.vercel_project_id!)}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => copyToClipboard(getVercelProjectUrl(org.vercel_project_id!), 'Vercel Project URL')}
                                style={styles.copyButton}
                            >
                                <Text style={styles.copyIcon}>📋</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Deployment Link */}
                {getDeploymentUrl(org) && (
                    <View style={styles.urlRow}>
                        <Text style={styles.urlLabel}>Live Site:</Text>
                        <View style={styles.urlContainer}>
                            <TouchableOpacity
                                onPress={() => openUrl(getDeploymentUrl(org)!, 'Live Site')}
                                style={styles.urlTextContainer}
                            >
                                <Text style={styles.urlText} numberOfLines={1}>
                                    {getDeploymentUrl(org)}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => copyToClipboard(getDeploymentUrl(org)!, 'Live Site URL')}
                                style={styles.copyButton}
                            >
                                <Text style={styles.copyIcon}>📋</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Fallback if no Vercel info */}
                {!org.vercel_project_id && (
                    <Text style={styles.metaText}>No Vercel deployment</Text>
                )}
            </View>
        </Card>
    );

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
        >
            <View style={styles.header}>
                <Text style={styles.title}>Organization Management</Text>
                <Button
                    title={showForm ? 'Hide Form' : 'Add Organization'}
                    onPress={() => setShowForm(!showForm)}
                    style={styles.toggleButton}
                />
            </View>

            {showForm && (
                <View style={styles.formContainer}>
                    <OrganizationForm
                        onSubmit={createOrganization}
                        loading={loading}
                    />
                </View>
            )}

            <Text style={styles.sectionTitle}>
                All Organizations ({organizations.length})
            </Text>

            <View style={styles.organizationsContainer}>
                {organizations.map(renderOrganization)}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.gray100,
    },
    scrollContent: {
        padding: SPACING.lg,
        paddingBottom: SPACING.xl,
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
        minWidth: 120,
    },
    formContainer: {
        marginBottom: SPACING.lg,
    },
    sectionTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: '600',
        color: COLORS.gray900,
        marginBottom: SPACING.md,
    },
    organizationsContainer: {
        // Container for all organization cards
    },
    orgCard: {
        marginBottom: SPACING.md,
    },
    orgHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.sm,
    },
    orgName: {
        fontSize: FONT_SIZES.lg,
        fontWeight: '600',
        color: COLORS.gray900,
        flex: 1,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    statusBadge: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: 4,
        borderRadius: 12,
    },
    deleteButton: {
        backgroundColor: '#FEE2E2',
        padding: SPACING.xs,
        borderRadius: 6,
        minWidth: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteIcon: {
        fontSize: 16,
    },
    statusactive: {
        backgroundColor: '#D1FAE5',
    },
    statusinactive: {
        backgroundColor: '#FEE2E2',
    },
    statuspending: {
        backgroundColor: '#FEF3C7',
    },
    statusText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '600',
        color: COLORS.gray700,
    },
    orgSubdomain: {
        fontSize: FONT_SIZES.md,
        color: COLORS.primary,
        marginBottom: SPACING.xs,
    },
    orgDomain: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.gray600,
        marginBottom: SPACING.sm,
    },
    orgMeta: {
        borderTopWidth: 1,
        borderTopColor: COLORS.gray200,
        paddingTop: SPACING.sm,
    },
    metaText: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.gray500,
        marginBottom: 2,
    },
    urlRow: {
        marginTop: SPACING.xs,
        marginBottom: SPACING.xs,
    },
    urlLabel: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.gray600,
        fontWeight: '600',
        marginBottom: 2,
    },
    urlContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.xs,
    },
    urlTextContainer: {
        flex: 1,
        backgroundColor: COLORS.gray50,
        padding: SPACING.xs,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: COLORS.gray200,
    },
    urlText: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.primary,
        fontFamily: 'monospace',
    },
    copyButton: {
        backgroundColor: COLORS.gray50,
        padding: SPACING.xs,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: COLORS.gray200,
        minWidth: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    copyIcon: {
        fontSize: 16,
    },
    errorText: {
        fontSize: FONT_SIZES.md,
        color: COLORS.danger,
        textAlign: 'center',
        marginTop: SPACING.xl,
    },
});