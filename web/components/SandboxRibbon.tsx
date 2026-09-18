import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { currentReleaseChannel } from '../lib/tenant';

// HT-41: a small persistent tag on demo.handytally.com so that a screenshot
// or a screen share from the sandbox is never mistaken for a customer site.
// Demo runs the latest master, unreleased work and its bugs included.
//
// Decided after mount: the hostname is unknown during the static render, and
// deciding there would make the server and client trees differ.
export function SandboxRibbon() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(currentReleaseChannel === 'demo');
  }, []);
  if (!show) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.pill}>
        <Text style={styles.text}>SANDBOX · demo</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  pill: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  text: {
    color: '#1f1300',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
