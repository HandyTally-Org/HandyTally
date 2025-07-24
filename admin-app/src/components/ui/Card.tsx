import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../utils/constants';

interface CardProps {
    children: React.ReactNode;
    style?: any;
}

export const Card: React.FC<CardProps> = ({ children, style }) => {
    return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
});