import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../utils/formatting';

// HT-10: where the Approve button in an estimate email lands.
//
//   /approve?token=<invoices.approval_token>
//
// Public on purpose: it sits outside the (app) group, so the session check in
// app/(app)/_layout.tsx does not apply, and the client approving is not a
// HandyTally user. The page posts the token to the approve-estimate function
// as soon as it loads, so one click in the email is enough. The function does
// the actual work with the service role; the anon key the page sends only
// gets the request through the gateway.
//
// The approval happens from script, not from the link itself, so a mail
// scanner that merely fetches the URL does not approve anything.

type Stage = 'working' | 'approved' | 'already_approved' | 'closed' | 'invalid' | 'error';

type ApprovalSummary = {
  invoice_number?: string | number;
  total?: number | null;
  client_name?: string | null;
  approved_at?: string | null;
  business_name?: string | null;
};

export default function ApproveEstimateScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [stage, setStage] = useState<Stage>('working');
  const [summary, setSummary] = useState<ApprovalSummary>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = typeof params.token === 'string' ? params.token.trim() : '';

    if (!token) {
      setStage('invalid');
      return;
    }

    const approve = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('approve-estimate', {
          body: { token },
        });

        if (cancelled) return;

        if (error) {
          // On a non-2xx, supabase-js only says "Edge Function returned a
          // non-2xx status code"; the function's reason is on error.context.
          let reason = error.message;
          try {
            const body = await error.context?.json();
            if (body?.error) reason = body.error;
          } catch {
            // Body was not JSON; keep the generic message.
          }
          throw new Error(reason);
        }
        if (data?.error) throw new Error(data.error);

        setSummary(data ?? {});
        const result = data?.result;
        if (result === 'approved' || result === 'already_approved' || result === 'closed' || result === 'invalid') {
          setStage(result);
        } else {
          throw new Error('Unexpected reply from the server');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Approving the estimate failed:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        setStage('error');
      }
    };

    approve();
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const businessName = summary.business_name || 'HandyTally';
  const number = summary.invoice_number != null ? `#${summary.invoice_number}` : '';
  const total = summary.total != null ? formatCurrency(summary.total) : null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {stage === 'working' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.subtitle}>Recording your approval...</Text>
          </View>
        )}

        {stage === 'approved' && (
          <View style={styles.centered}>
            <Text style={styles.title}>Estimate {number} approved</Text>
            <Text style={styles.subtitle}>
              Thank you. {businessName} has been notified{total ? ` that you accepted the estimate for ${total}` : ''}.
              The work can now be scheduled.
            </Text>
          </View>
        )}

        {stage === 'already_approved' && (
          <View style={styles.centered}>
            <Text style={styles.title}>Already approved</Text>
            <Text style={styles.subtitle}>
              Estimate {number} was approved{summary.approved_at ? ` on ${formatDate(summary.approved_at)}` : ' earlier'}.
              Nothing has changed.
            </Text>
          </View>
        )}

        {stage === 'closed' && (
          <View style={styles.centered}>
            <Text style={styles.title}>This estimate is no longer open</Text>
            <Text style={styles.subtitle}>
              Estimate {number} can no longer be approved from this link. Please contact {businessName} if you have questions.
            </Text>
          </View>
        )}

        {stage === 'invalid' && (
          <View style={styles.centered}>
            <Text style={styles.title}>This link is not valid</Text>
            <Text style={styles.subtitle}>
              The approval link is incomplete or does not match an estimate. Please use the button in the email you received.
            </Text>
          </View>
        )}

        {stage === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              Your approval could not be recorded{errorMessage ? ` (${errorMessage})` : ''}. Please try the link again in a moment.
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.footer}>Powered by HandyTally</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'white',
    padding: 28,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  centered: {
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1b365d',
    marginBottom: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4b5563',
    marginTop: 12,
    textAlign: 'center',
  },
  footer: {
    marginTop: 20,
    fontSize: 12,
    color: '#9ca3af',
  },
});
