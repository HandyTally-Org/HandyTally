import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../../utils/constants';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    loading?: boolean;
    style?: any;
}

export const Button: React.FC<ButtonProps> = ({
                                                  title,
                                                  onPress,
                                                  variant = 'primary',
                                                  disabled = false,
                                                  loading = false,
                                                  style,
                                              }) => {
    const buttonStyle = [
        styles.button,
        styles[variant],
        disabled && styles.disabled,
        style,
    ];

    const textStyle = [
        styles.text,
        variant === 'secondary' ? styles.secondaryText : styles.primaryText,
    ];

    return (
        <TouchableOpacity
            style={buttonStyle}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
        >
            {loading ? (
                <ActivityIndicator color={variant === 'secondary' ? COLORS.primary : COLORS.white} />
            ) : (
                <Text style={textStyle}>{title}</Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
    },
    primary: {
        backgroundColor: COLORS.primary,
    },
    secondary: {
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.gray300,
    },
    danger: {
        backgroundColor: COLORS.danger,
    },
    disabled: {
        opacity: 0.5,
    },
    text: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
    },
    primaryText: {
        color: COLORS.white,
    },
    secondaryText: {
        color: COLORS.primary,
    },
});