// src/components/OrganizationForm.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { CreateOrganizationData } from '../types';
import { COLORS, SPACING, FONT_SIZES } from '../utils/constants';
import { supabase } from '../services/supabase';

interface OrganizationFormProps {
    onSubmit: (orgData: CreateOrganizationData) => Promise<any>;
    loading?: boolean;
}

interface SubdomainCheck {
    available: boolean | null;
    checking: boolean;
    error?: string;
}

const BASE_DOMAIN = process.env.EXPO_PUBLIC_BASE_DOMAIN || 'yourdomain.com';

// Helper function to slugify a string
const slugify = (text: string): string => {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
        .slice(0, 50); // Limit length for practical use
};

export const OrganizationForm: React.FC<OrganizationFormProps> = ({
                                                                      onSubmit,
                                                                      loading = false,
                                                                  }) => {
    const [formData, setFormData] = useState<CreateOrganizationData>({
        name: '',
        subdomain: '',
    });

    const [errors, setErrors] = useState<Partial<CreateOrganizationData>>({});
    const [submitting, setSubmitting] = useState(false);
    const [subdomainTouched, setSubdomainTouched] = useState(false); // Track if user manually edited subdomain
    const [subdomainCheck, setSubdomainCheck] = useState<SubdomainCheck>({
        available: null,
        checking: false
    });

    // Debounced subdomain availability check
    const checkSubdomainAvailability = useCallback(
        async (subdomain: string) => {
            if (!subdomain || subdomain.length < 3) {
                setSubdomainCheck({ available: null, checking: false });
                return;
            }

            setSubdomainCheck({ available: null, checking: true });

            try {
                const { data, error } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('subdomain', subdomain.toLowerCase())
                    .maybeSingle();

                if (error) {
                    console.error('Subdomain check error:', error);
                    setSubdomainCheck({
                        available: null,
                        checking: false,
                        error: 'Could not check subdomain availability'
                    });
                    return;
                }

                const available = !data;
                setSubdomainCheck({ available, checking: false });

                // Update form errors based on availability
                if (!available) {
                    setErrors(prev => ({
                        ...prev,
                        subdomain: 'This subdomain is already taken'
                    }));
                } else {
                    // Clear subdomain error if it was about availability
                    setErrors(prev => {
                        const newErrors = { ...prev };
                        if (newErrors.subdomain === 'This subdomain is already taken') {
                            delete newErrors.subdomain;
                        }
                        return newErrors;
                    });
                }
            } catch (error) {
                console.error('Unexpected error checking subdomain:', error);
                setSubdomainCheck({
                    available: null,
                    checking: false,
                    error: 'Network error checking subdomain'
                });
            }
        },
        []
    );

    // Debounce subdomain check
    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.subdomain && formData.subdomain.length >= 3) {
                checkSubdomainAvailability(formData.subdomain);
            }
        }, 500); // 500ms delay

        return () => clearTimeout(timer);
    }, [formData.subdomain, checkSubdomainAvailability]);

    const validateForm = (): boolean => {
        const newErrors: Partial<CreateOrganizationData> = {};

        // Validate name
        if (!formData.name.trim()) {
            newErrors.name = 'Organization name is required';
        } else if (formData.name.trim().length < 2) {
            newErrors.name = 'Organization name must be at least 2 characters';
        } else if (formData.name.trim().length > 100) {
            newErrors.name = 'Organization name must be less than 100 characters';
        }

        // Validate subdomain
        if (!formData.subdomain.trim()) {
            newErrors.subdomain = 'Subdomain is required';
        } else {
            const subdomain = formData.subdomain.toLowerCase().trim();

            // Check format
            if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
                newErrors.subdomain = 'Subdomain can only contain lowercase letters, numbers, and hyphens (not at start/end)';
            } else if (subdomain.length < 3) {
                newErrors.subdomain = 'Subdomain must be at least 3 characters';
            } else if (subdomain.length > 63) {
                newErrors.subdomain = 'Subdomain must be less than 63 characters';
            } else {
                // Check for reserved subdomains
                const reserved = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost', 'staging', 'test', 'dev', 'demo'];
                if (reserved.includes(subdomain)) {
                    newErrors.subdomain = 'This subdomain is reserved and cannot be used';
                } else if (subdomainCheck.available === false) {
                    newErrors.subdomain = 'This subdomain is already taken';
                }
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm() || submitting || subdomainCheck.checking) return;

        // Final availability check before submission
        if (subdomainCheck.available !== true) {
            Alert.alert('Error', 'Please wait for subdomain availability check to complete');
            return;
        }

        setSubmitting(true);
        try {
            const result = await onSubmit({
                name: formData.name.trim(),
                subdomain: formData.subdomain.toLowerCase().trim()
            });

            if (result.success) {
                // Reset form on success
                setFormData({ name: '', subdomain: '' });
                setErrors({});
                setSubdomainTouched(false); // Reset touched state
                setSubdomainCheck({ available: null, checking: false });

                // Show success message with infrastructure details
                const infraStatus = result.infrastructure;
                let message = 'Organization created successfully!';

                if (infraStatus?.success) {
                    message += '\n✅ DNS record created\n✅ Vercel project deployed';
                    if (infraStatus.domain) {
                        message += `\n🌐 Available at: ${infraStatus.domain}`;
                    }
                } else if (infraStatus?.errors?.length > 0) {
                    message += '\n⚠️ Some infrastructure setup failed:';
                    infraStatus.errors.forEach(error => {
                        message += `\n• ${error}`;
                    });
                }

                Alert.alert('Success', message);
            } else {
                Alert.alert('Error', result.error || 'Failed to create organization');
            }
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubdomainChange = (text: string) => {
        // Mark subdomain as manually touched
        if (!subdomainTouched) {
            setSubdomainTouched(true);
        }

        // Auto-format subdomain as user types
        const formatted = text
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '') // Remove invalid characters
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            .replace(/-+/g, '-'); // Replace multiple hyphens with single

        setFormData({ ...formData, subdomain: formatted });

        // Reset subdomain check when user changes input
        setSubdomainCheck({ available: null, checking: false });

        // Clear subdomain error when user starts typing
        if (errors.subdomain && formatted.length > 0) {
            setErrors({ ...errors, subdomain: undefined });
        }
    };

    const handleNameChange = (text: string) => {
        setFormData({ ...formData, name: text });

        // Auto-generate subdomain from name ONLY if user hasn't manually touched subdomain
        if (!subdomainTouched && text.length > 0) {
            const slugified = slugify(text);
            if (slugified.length >= 3) {
                setFormData(prev => ({ ...prev, subdomain: slugified }));
            } else if (slugified.length > 0) {
                // If slugified result is too short but not empty, still set it
                setFormData(prev => ({ ...prev, subdomain: slugified }));
            }
        }

        // Clear name error when user starts typing
        if (errors.name && text.trim().length > 0) {
            setErrors({ ...errors, name: undefined });
        }
    };

    // Enhanced subdomain input with availability indicator
    const renderSubdomainInput = () => {
        let subdomainError = errors.subdomain;
        let inputStyle = {};
        let statusIndicator = null;

        if (formData.subdomain.length >= 3) {
            if (subdomainCheck.checking) {
                statusIndicator = (
                    <View style={styles.statusIndicator}>
                        <View style={styles.checkingDot} />
                        <Text style={styles.statusText}>Checking...</Text>
                    </View>
                );
            } else if (subdomainCheck.available === true) {
                statusIndicator = (
                    <View style={styles.statusIndicator}>
                        <View style={styles.availableDot} />
                        <Text style={[styles.statusText, styles.availableText]}>Available!</Text>
                    </View>
                );
            } else if (subdomainCheck.available === false) {
                statusIndicator = (
                    <View style={styles.statusIndicator}>
                        <View style={styles.unavailableDot} />
                        <Text style={[styles.statusText, styles.unavailableText]}>Not available</Text>
                    </View>
                );
            }
        }

        return (
            <View>
                <Input
                    label={`Subdomain${!subdomainTouched ? ' (auto-generated)' : ''}`}
                    value={formData.subdomain}
                    onChangeText={handleSubdomainChange}
                    placeholder="acme-corp"
                    error={subdomainError}
                />
                {!subdomainTouched && formData.name && (
                    <Text style={styles.autoGenerateHint}>
                        💡 Subdomain is auto-generated from organization name. Edit to customize.
                    </Text>
                )}
                {statusIndicator && (
                    <View style={styles.statusContainer}>
                        {statusIndicator}
                    </View>
                )}
            </View>
        );
    };

    const isFormValid =
        formData.name.trim().length > 0 &&
        formData.subdomain.trim().length >= 3 &&
        subdomainCheck.available === true &&
        !subdomainCheck.checking &&
        Object.keys(errors).length === 0;

    return (
        <Card>
            <Text style={styles.title}>Create New Organization</Text>
            <Text style={styles.subtitle}>
                This will create a new organization with automatic DNS and deployment setup
            </Text>

            <Input
                label="Organization Name"
                value={formData.name}
                onChangeText={handleNameChange}
                placeholder="Acme Corporation"
                error={errors.name}
            />

            {renderSubdomainInput()}

            {formData.subdomain && subdomainCheck.available === true && (
                <View style={styles.previewContainer}>
                    <Text style={styles.previewLabel}>Your organization will be available at:</Text>
                    <Text style={styles.previewUrl}>
                        https://{formData.subdomain}.{BASE_DOMAIN}
                    </Text>
                </View>
            )}

            <View style={styles.infoContainer}>
                <Text style={styles.infoTitle}>What happens next:</Text>
                <Text style={styles.infoText}>• DNS record will be created automatically</Text>
                <Text style={styles.infoText}>• Vercel project will be deployed</Text>
                <Text style={styles.infoText}>• Organization will be ready in ~2-3 minutes</Text>
            </View>

            <Button
                title={submitting ? 'Creating Organization...' : 'Create Organization'}
                onPress={handleSubmit}
                loading={submitting || loading}
                disabled={!isFormValid || submitting}
                style={styles.submitButton}
                fullWidth
            />

            {!isFormValid && formData.subdomain.length >= 3 && (
                <Text style={styles.validationHint}>
                    {subdomainCheck.checking
                        ? 'Checking subdomain availability...'
                        : subdomainCheck.available === false
                            ? 'Please choose a different subdomain'
                            : 'Please fix the errors above'
                    }
                </Text>
            )}
        </Card>
    );
};

const styles = StyleSheet.create({
    title: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: COLORS.gray900,
        marginBottom: SPACING.sm,
    },
    subtitle: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.gray600,
        marginBottom: SPACING.xl,
        lineHeight: 20,
    },
    statusContainer: {
        marginTop: -SPACING.sm,
        marginBottom: SPACING.md,
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.sm,
    },
    checkingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.warning,
        marginRight: SPACING.xs,
    },
    availableDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.success,
        marginRight: SPACING.xs,
    },
    unavailableDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.danger,
        marginRight: SPACING.xs,
    },
    statusText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '500',
    },
    availableText: {
        color: COLORS.success,
    },
    unavailableText: {
        color: COLORS.danger,
    },
    autoGenerateHint: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.primary,
        marginTop: -SPACING.sm,
        marginBottom: SPACING.sm,
        paddingHorizontal: SPACING.sm,
        fontStyle: 'italic',
    },
    previewContainer: {
        backgroundColor: COLORS.gray100,
        padding: SPACING.md,
        borderRadius: 8,
        marginBottom: SPACING.md,
        borderLeftWidth: 3,
        borderLeftColor: COLORS.success,
    },
    previewLabel: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.gray600,
        marginBottom: SPACING.xs,
    },
    previewUrl: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
        color: COLORS.primary,
        fontFamily: 'monospace',
    },
    infoContainer: {
        backgroundColor: COLORS.gray50,
        padding: SPACING.md,
        borderRadius: 8,
        marginBottom: SPACING.lg,
        borderLeftWidth: 3,
        borderLeftColor: COLORS.primary,
    },
    infoTitle: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
        color: COLORS.gray900,
        marginBottom: SPACING.sm,
    },
    infoText: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.gray600,
        marginBottom: SPACING.xs,
    },
    submitButton: {
        marginTop: SPACING.md,
    },
    validationHint: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.gray500,
        textAlign: 'center',
        marginTop: SPACING.sm,
        fontStyle: 'italic',
    },
});