import { StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { APP_VERSION, formatVersionLabel } from '../constants/release';
import { currentReleaseChannelLabel } from '../lib/tenant';
import { themed } from '../constants/Colors';

// HT-41: the drawer footer's version line, replacing the hard-coded `v1.0`.
// Reads `v1.5.0 · prod`, `v1.5.0 · wgelectricus` or `master-3f2a1c9 · demo`
// and opens /whats-new. Bug reports copy this into the DevIssues Version
// field, so it must say exactly what the host runs.
export function VersionBadge({ style }: { style?: StyleProp<TextStyle> }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/whats-new')}
      accessibilityRole="link"
      accessibilityLabel="What's new in this version"
    >
      <Text style={[styles.text, style]}>{formatVersionLabel(APP_VERSION, currentReleaseChannelLabel)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 12,
    color: themed.muted,
  },
});
