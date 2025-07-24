import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { COLORS, SPACING, FONT_SIZES } from '../../utils/constants';

interface SelectOption {
    label: string;
    value: string;
}

interface SelectProps {
    label?: string;
    value: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    error?: string;
    style?: any;
}

export const Select: React.FC<SelectProps> = ({
                                                  label,
                                                  value,
                                                  onValueChange,
                                                  options,
                                                  placeholder = 'Select an option',
                                                  error,
                                                  style,
                                              }) => {
    return (
        <View style={[styles.container, style]}>
            {label && <Text style={styles.label}>{label}</Text>}
            <View style={[styles.pickerContainer, error && styles.pickerError]}>
                <Picker
                    selectedValue={value}
                    onValueChange={onValueChange}
                    style={styles.picker}
                >
                    <Picker.Item label={placeholder} value="" enabled={false} />
                    {options.map((option) => (
                        <Picker.Item
                            key={option.value}
                            label={option.label}
                            value={option.value}
                        />
                    ))}
                </Picker>
            </View>
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
    pickerContainer: {
        borderWidth: 1,
        borderColor: COLORS.gray300,
        borderRadius: 8,
        backgroundColor: COLORS.white,
    },
    pickerError: {
        borderColor: COLORS.danger,
    },
    picker: {
        height: 50,
        color: COLORS.gray900,
    },
    errorText: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.danger,
        marginTop: SPACING.xs,
    },
});