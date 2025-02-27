import React from 'react';
import { Text, StyleSheet } from 'react-native';

type ExactHeaderProps = {
  title: string;
};

export function ExactHeader({ title }: ExactHeaderProps) {
  return (
    <Text style={styles.header}>{title}</Text>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 20,
    fontWeight: 'normal',
    marginBottom: 16,
    fontFamily: 'System',
    color: '#333333',
  },
}); 