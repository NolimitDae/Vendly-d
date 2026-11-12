import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { api } from '../services/api';
import { apiMessage } from '../screens/auth/SignIn';
import { DARK, FONTS } from '../constants/colors';
import { INSTANT_PAYOUT_FEE } from '../constants/payouts';

// Stripe's native module isn't in Expo Go (or on web): the payout screen then uses Stripe's setup page instead
let connect: {
  loadConnectAndInitialize: (p: { publishableKey: string; fetchClientSecret: () => Promise<string>; appearance?: unknown; fonts?: unknown }) => unknown;
  ConnectComponentsProvider: React.ComponentType<{ connectInstance: any; children: React.ReactNode }>;
  ConnectAccountOnboarding: React.ComponentType<{ title?: string; onExit: () => void; onLoadError?: (e: unknown) => void }>;
  ConnectPayouts?: React.ComponentType<{ onLoadError?: (e: unknown) => void; style?: object }>;
} | null = null;
try {
  const stripe = require('@stripe/stripe-react-native');
  if (stripe.loadConnectAndInitialize && stripe.ConnectComponentsProvider && stripe.ConnectAccountOnboarding) connect = stripe;
} catch {}

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/** Whether Stripe's payout setup can open inside the app (this build has it, and the app has a Stripe key). */
export const canSetUpPayoutsInApp = () => !!connect && !!PUBLISHABLE_KEY && Platform.OS !== 'web';

const sessionSecret = async () => {
  const res = await api.post('/withdraw/account-session');
  const secret = res.data?.data?.clientSecret;
  if (!secret) throw new Error(res.data?.message ?? 'Could not open payout setup');
  return secret as string;
};

/**
 * A Connect instance for the vendor's own payout account (the server makes a short-lived session for it,
 * and the account if there is none). A refusal (a test account, not a vendor) is shown and closes
 * (`onDone`); anything else calls `onFallback`.
 */
function useConnectInstance(onDone: () => void, onFallback: () => void) {
  const [instance, setInstance] = useState<unknown>(null);

  useEffect(() => {
    if (!connect) return onFallback();
    let cancelled = false;
    // first check a session can be made, so a refusal (a test account, not a vendor) shows its own message
    sessionSecret()
      .then((first) => {
        if (cancelled) return;
        let initial: string | null = first;
        setInstance(
          connect!.loadConnectAndInitialize({
            publishableKey: PUBLISHABLE_KEY,
            // Stripe asks again when a session expires
            fetchClientSecret: async () => {
              if (initial) {
                const s = initial;
                initial = null;
                return s;
              }
              return sessionSecret();
            },
            // the app's dark plum look and font (Stripe's screens are web pages, so the font is loaded for them)
            fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap' }],
            appearance: {
              variables: {
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                borderRadius: '12px',
                colorPrimary: DARK.accent,
                colorBackground: DARK.bg,
                colorText: DARK.text,
                colorSecondaryText: DARK.muted,
                colorBorder: '#3B2C42',
                colorDanger: '#FCA5A5',
                actionPrimaryColorText: DARK.accent,
                buttonPrimaryColorBackground: DARK.accent,
                buttonPrimaryColorBorder: DARK.accent,
                buttonPrimaryColorText: '#1E0822',
                buttonSecondaryColorBackground: DARK.field,
                buttonSecondaryColorBorder: DARK.field,
                buttonSecondaryColorText: DARK.text,
                badgeNeutralColorBackground: DARK.field,
                badgeNeutralColorText: DARK.text,
                offsetBackgroundColor: DARK.card,
                formBackgroundColor: DARK.card,
              },
            },
          }),
        );
      })
      .catch((err: any) => {
        if (cancelled) return;
        const status = Number(err?.response?.status ?? 0);
        if (status >= 400 && status < 500) {
          Alert.alert('Payout setup', apiMessage(err, 'Payouts are not available for this account.'));
          onDone();
        } else onFallback();
      });
    return () => {
      cancelled = true;
    };
    // runs once, when the setup opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return instance;
}

/**
 * Stripe's payout setup (Connect embedded onboarding) as a full-screen sheet inside the app, so the vendor
 * never leaves Vendly. The server makes their payout account if they have none yet. `onDone` runs when
 * they finish or close it (the screen then reloads their status); `onFallback` when the embedded form
 * can't open, so the screen can use Stripe's setup page instead.
 */
export default function StripePayoutSetup({ onDone, onFallback }: { onDone: () => void; onFallback: () => void }) {
  const instance = useConnectInstance(onDone, onFallback);

  if (!connect || !instance) return null;
  const { ConnectComponentsProvider, ConnectAccountOnboarding } = connect;
  return (
    <ConnectComponentsProvider connectInstance={instance}>
      <ConnectAccountOnboarding
        title="Set up payouts"
        onExit={onDone}
        onLoadError={(e) => {
          Sentry.captureMessage(`Embedded payout setup failed to load: ${String((e as any)?.error?.message ?? e)}`, 'warning');
          onFallback();
        }}
      />
    </ConnectComponentsProvider>
  );
}

/** Whether this build can show the vendor's payout details inside the app. */
export const canShowPayoutDetailsInApp = () => canSetUpPayoutsInApp() && !!connect?.ConnectPayouts;

/**
 * The vendor's payout details inside the app (Stripe's embedded Payouts): their Stripe balance, payouts to
 * their bank, and changing the bank account they go to. `onClose` when they close it (or it can't open).
 */
export function StripePayoutDetails({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const fail = () => {
    Alert.alert('Payout details', "Couldn't open your payout details. Try again in a moment, or update them on vendlymarketplace.com.");
    onClose();
  };
  const instance = useConnectInstance(onClose, fail);
  const Payouts = connect?.ConnectPayouts;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[d.root, { paddingBottom: insets.bottom }]}>
        <View style={d.header}>
          <Text style={d.title}>Payout details</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={DARK.text} />
          </Pressable>
        </View>
        <Text style={d.sub}>Change the bank account your earnings go to, see payouts on their way, or cash out instantly. Stripe&apos;s fee for an instant payout is {INSTANT_PAYOUT_FEE} of the amount, shown before you confirm; standard payouts are free.</Text>
        {!connect || !instance || !Payouts ? (
          <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
        ) : (
          <connect.ConnectComponentsProvider connectInstance={instance}>
            <Payouts
              style={{ flex: 1 }}
              onLoadError={(e) => {
                Sentry.captureMessage(`Embedded payout details failed to load: ${String((e as any)?.error?.message ?? e)}`, 'warning');
                fail();
              }}
            />
          </connect.ConnectComponentsProvider>
        )}
      </View>
    </Modal>
  );
}

const d = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20 },
  title: { color: DARK.text, fontFamily: FONTS.bold, fontSize: 20 },
  sub: { color: DARK.muted, fontFamily: FONTS.regular, fontSize: 14, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
});
