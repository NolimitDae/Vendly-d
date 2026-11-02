import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { api } from '../services/api';
import { apiMessage } from '../screens/auth/SignIn';

// Stripe's native module isn't in Expo Go (or on web): the payout screen then uses Stripe's setup page instead
let connect: {
  loadConnectAndInitialize: (p: { publishableKey: string; fetchClientSecret: () => Promise<string>; appearance?: unknown }) => unknown;
  ConnectComponentsProvider: React.ComponentType<{ connectInstance: any; children: React.ReactNode }>;
  ConnectAccountOnboarding: React.ComponentType<{ title?: string; onExit: () => void; onLoadError?: (e: unknown) => void }>;
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
 * Stripe's payout setup (Connect embedded onboarding) as a full-screen sheet inside the app, so the vendor
 * never leaves Vendly. The server makes their payout account if they have none yet. `onDone` runs when
 * they finish or close it (the screen then reloads their status); `onFallback` when the embedded form
 * can't open, so the screen can use Stripe's setup page instead.
 */
export default function StripePayoutSetup({ onDone, onFallback }: { onDone: () => void; onFallback: () => void }) {
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
            appearance: { variables: { colorPrimary: '#5E1B66', borderRadius: '12px' } },
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
