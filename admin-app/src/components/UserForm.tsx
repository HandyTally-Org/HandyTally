import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { CreateUserData, UserRole, Organization } from '../types';
import { SPACING } from '../utils/constants';

interface UserFormProps {
    onSubmit: (userData: CreateUserData) => Promise<void>;
    organizations: Organization[];
    loading?: boolean;
}

export const UserForm: React.FC<UserFormProps> = ({
                                                      onSubmit,
                                                      organizations,
                                                      loading = false,
                                                  }) => {
    const [formData, setFormData] = useState<CreateUserData>({
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'user',
        organization_id: '',
    });

    const [errors, setErrors] = useState<Partial<CreateUserData>>({});

    const validateForm = (): boolean => {
        const newErrors: Partial<CreateUserData> = {};

        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Email is invalid';
        }

        if (!formData.password.trim()) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        if (!formData.role) {
            newErrors.role = 'Role is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        try {
            await onSubmit(formData);
            // Reset form on success
            setFormData({
                email: '',
                password: '',
                first_name: '',
                last_name: '',
                role: 'user',
                organization_id: '',
            });
            setErrors({});
            Alert.alert('Success', 'User created successfully');
        } catch (error) {
            Alert.alert('Error', 'Failed to create user');
        }
    };

    const roleOptions = [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
        { label: 'Superuser', value: 'superuser' },
    ];

    const organizationOptions = organizations.map(org => ({
        label: org.name,
        value: org.id,
    }));

    return (
        <Card>
            <Input
                label="Email"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="user@example.com"
                error={errors.email}
            />

            <Input
                label="Password"
                value={formData.password}
                onChangeText={(text) => setFormData({ ...formData, password: text })}
                placeholder="Enter password"
                secureTextEntry
                error={errors.password}
            />

            <Input
                label="First Name"
                value={formData.first_name || ''}
                onChangeText={(text) => setFormData({ ...formData, first_name: text })}
                placeholder="John"
            />

            <Input
                label="Last Name"
                value={formData.last_name || ''}
                onChangeText={(text) => setFormData({ ...formData, last_name: text })}
                placeholder="Doe"
            />

            <Select
                label="Role"
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
                options={roleOptions}
                error={errors.role}
            />

            <Select
                label="Organization (Optional)"
                value={formData.organization_id || ''}
                onValueChange={(value) => setFormData({ ...formData, organization_id: value })}
                options={organizationOptions}
                placeholder="Select organization"
            />

            <Button
                title="Create User"
                onPress={handleSubmit}
                loading={loading}
                style={styles.submitButton}
            />
        </Card>
    );
};

const styles = StyleSheet.create({
    submitButton: {
        marginTop: SPACING.md,
    },
});