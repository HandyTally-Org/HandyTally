import React from 'react';
import { View, TextInput, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../../utils/constants';

interface InputProps {
    label?: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    secureTextEntry?: boolean;
    error?: string;
    multiline?: boolean;
    numberOfLines?: number;
    style?: ViewStyle;
    type?: 'text' | 'email' | 'password';
}

export const Input: React.FC<InputProps> = ({
                                                label,
                                                value,
                                                onChangeText,
                                                placeholder,
                                                secureTextEntry = false,
                                                error,
                                                multiline = false,
                                                numberOfLines = 1,
                                                style,
                                                type = 'text',
                                            }) => {
    // Web-specific props for better form integration
    const webProps = typeof window !== 'undefined' ? {
        autoComplete: type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'off',
        name: type === 'email' ? 'email' : type === 'password' ? 'password' : 'text',
        id: `input-${type}-${Math.random().toString(36).substr(2, 9)}`,
    } : {};

    return (
        <View style={[styles.container, style]}>
            {label && (
                <Text
                    style={styles.label}
                    // Connect label to input for accessibility
                    {...(webProps.id && { htmlFor: webProps.id })}
                >
                    {label}
                </Text>
            )}
            <TextInput
                style={[
                    styles.input,
                    error && styles.inputError,
                    multiline && styles.multiline,
                ]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                secureTextEntry={secureTextEntry}
                multiline={multiline}
                numberOfLines={numberOfLines}
                placeholderTextColor={COLORS.gray500}
                // Web-specific form props
                {...webProps}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: SPACING.md,
    },
    label: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
        color: COLORS.gray700,
        marginBottom: SPACING.xs,
    },
    input: {
        borderWidth: 1,
        borderColor: COLORS.gray300,
        borderRadius: 8,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        fontSize: FONT_SIZES.md,
        color: COLORS.gray900,
        backgroundColor: COLORS.white,
        outlineStyle: 'none' as any, // Remove focus outline on web
    },
    inputError: {
        borderColor: COLORS.danger,
    },
    multiline: {
        height: 100,
        textAlignVertical: 'top',
    },
    errorText: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.danger,
        marginTop: SPACING.xs,
    },
});