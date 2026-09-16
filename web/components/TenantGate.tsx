import { ReactNode } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { BASE_DOMAIN } from '../lib/tenant';

// HT-38: on a customer subdomain, an opaque layer covers the app until the
// hostname has been resolved to an organisation, and an unknown subdomain
// keeps the layer up with a "no company here" message.
//
// The children always render: Expo Router requires the root navigator to be
// mounted on the very first render, so the gate cannot replace it (doing so
// gave a blank page with "Attempted to navigate before mounting the Root
// Layout"). Hosts without a tenant never show the layer.
export function TenantGate({ children }: { children: ReactNode }) {
  const { tenant } = useAuth();

  let layer: ReactNode = null;

  if (tenant.status === 'loading') {
    layer = (
      <View style={styles.layer}>
        <ActivityIndicator size="large" color="#444444" />
      </View>
    );
  } else if (tenant.status === 'not_found') {
    const host = `${tenant.subdomain}.${BASE_DOMAIN}`;
    layer = (
      <View style={styles.layer}>
        <View style={styles.card}>
          <Text style={styles.title}>No company found at this address</Text>
          <Text style={styles.body}>
            There is no HandyTally company at {host}. Check the address with whoever gave it to you.
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL(`https://${BASE_DOMAIN}`)}>
            <Text style={styles.link}>Go to {BASE_DOMAIN}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      {children}
      {layer}
    </>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  link: {
    fontSize: 15,
    color: '#1976d2',
    fontWeight: '500',
  },
});
