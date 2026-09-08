import React from 'react';
import { Text, StyleSheet } from 'react-native';

type PageHeaderProps = {
  title: string;
};

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <Text style={styles.title}>{title}</Text>
  );
}

const styles = StyleSheet.create({
  // Matches the inline page title on the Jobs screen.
  title: {
    fontFamily: 'System',
    fontWeight: '600',
    fontSize: 26,
    marginBottom: 16,
    color: '#333333',
  },
}); 