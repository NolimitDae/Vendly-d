import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { navigationRef } from '../navigation/navigationRef';
import { OnboardingService, type Onboarding, type OnboardingRole } from '../services/onboarding.service';

const WEB = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://vendlymarketplace.com').replace(/\/+$/, '');
/** Checking costs a couple of Stripe lookups, so don't re-check more often than this. */
const MIN_GAP_MS = 45_000;

type Target = { tab: string; screen: string; params?: object } | { url: string };

/** Where each step is done, per role. Steps with no target (e.g. a verified email) just show their tick. */
const TARGETS: Record<OnboardingRole, Record<string, Target>> = {
  CUSTOMER: {
    verify_id: { tab: 'ProfileTab', screen: 'VerifyIdentity' },
    add_card: { tab: 'ProfileTab', screen: 'PaymentMethods' },
    profile_photo: { tab: 'ProfileTab', screen: 'EditProfile' },
    add_location: { tab: 'ProfileTab', screen: 'EditProfile' },
  },
  VENDOR: {
    business_license: { tab: 'ProfileTab', screen: 'License' },
    verify_id: { tab: 'ProfileTab', screen: 'VerifyIdentity' },
    first_package: { tab: 'DashboardTab', screen: 'VendorListings' },
    payouts: { tab: 'ProfileTab', screen: 'Payouts' },
    booking_contract: { tab: 'ProfileTab', screen: 'VendorContracts' },
    shop_branding: { tab: 'ProfileTab', screen: 'EditProfile' },
  },
  EVENT_PLANNER: {
    planner_profile: { tab: 'ProfileTab', screen: 'PlannerProfile' },
    // licences for planners are uploaded on the website's planner profile
    business_license: { url: `${WEB}/event-planner/profile` },
    verify_id: { tab: 'ProfileTab', screen: 'VerifyIdentity' },
    add_card: { tab: 'ProfileTab', screen: 'PaymentMethods' },
    first_event: { tab: 'HomeTab', screen: 'CreateEvent' },
  },
};

export function hasTarget(role: OnboardingRole, key: string) {
  return !!TARGETS[role]?.[key];
}

/** Opens the screen where a checklist step is done. */
export function openStep(role: OnboardingRole, key: string) {
  const t = TARGETS[role]?.[key];
  if (!t) return;
  if ('url' in t) return void Linking.openURL(t.url).catch(() => {});
  if (navigationRef.isReady()) navigationRef.navigate(t.tab, { screen: t.screen, initial: false, params: t.params });
}

interface Ctx {
  data: Onboarding | null;
  refresh: (force?: boolean) => Promise<void>;
  markSeen: (kind: 'intro' | 'complete') => void;
}

const OnboardingContext = createContext<Ctx>({ data: null, refresh: async () => {}, markSeen: () => {} });

/** The signed-in role's "get set up" checklist, kept fresh as the app comes back to the foreground and screens change. */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Onboarding | null>(null);
  const last = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (inFlight.current || (!force && Date.now() - last.current < MIN_GAP_MS)) return;
    inFlight.current = true;
    last.current = Date.now();
    try {
      const res = await OnboardingService.get();
      setData(res.data?.data ?? null);
    } catch {
      // keep what we had; the next check tries again
    } finally {
      inFlight.current = false;
    }
  }, []);

  const markSeen = useCallback((kind: 'intro' | 'complete') => {
    setData((d) => (d ? { ...d, popup: null, visible: kind === 'complete' ? false : d.visible } : d));
    OnboardingService.seen(kind).catch(() => {});
  }, []);

  useEffect(() => {
    void refresh(true);
    const app = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    // finishing a step usually ends with leaving its screen
    const nav = navigationRef.addListener('state', () => void refresh());
    return () => {
      app.remove();
      nav();
    };
  }, [refresh]);

  return <OnboardingContext.Provider value={{ data, refresh, markSeen }}>{children}</OnboardingContext.Provider>;
}

export const useOnboarding = () => useContext(OnboardingContext);
