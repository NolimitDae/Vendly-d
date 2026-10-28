import React from 'react';
import { Animated, Easing, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS, DARK, FONTS } from '../constants/colors';
import { AnimatedLogoMark, useReduceMotion } from '../components/brand';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { navigationRef } from './navigationRef';
import { OnboardingProvider } from '../context/OnboardingContext';
import OnboardingPopup from '../components/OnboardingPopup';

import AuthScreens from './AuthScreens';
import CustomerTabs from './CustomerTabs';
import VendorTabs from './VendorTabs';
import EventPlannerTabs from './EventPlannerTabs';

export default function RootNavigator() {
  const { user, loading } = useAuth();
  usePushNotifications(user?.type);
  // at launch the full logo plays before the app opens (about 2.7s); a timer makes sure a stalled
  // animation can never keep the app on this screen
  const [logoDone, setLogoDone] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setLogoDone(true), 4500);
    return () => clearTimeout(t);
  }, []);

  if (loading || !logoDone) return <LaunchLogo onDone={() => setLogoDone(true)} />;

  return (
    // Keyed on the role: switching roles starts the new role's tabs fresh, instead of carrying the
    // old screen history (e.g. the Switch role screen) into them.
    <NavigationContainer ref={navigationRef} key={user ? `role-${user.type}` : 'signed-out'}>
      {!user ? (
        <AuthScreens />
      ) : user.type === 'CUSTOMER' || user.type === 'CLIENT' ? (
        // The website registers customers as CLIENT; both are the same kind of account.
        <WithOnboarding><CustomerTabs /></WithOnboarding>
      ) : user.type === 'VENDOR' ? (
        <WithOnboarding><VendorTabs /></WithOnboarding>
      ) : user.type === 'EVENT_PLANNER' ? (
        <WithOnboarding><EventPlannerTabs /></WithOnboarding>
      ) : user.type === 'ADMIN' ? (
        <View style={s.adminMsg}>
          <Text style={s.adminTitle}>Admin Portal</Text>
          <Text style={s.adminSub}>
            The admin dashboard is only available on the web platform.
            {'\n'}Please visit vendly.com/admin to continue.
          </Text>
        </View>
      ) : (
        <EventPlannerTabs />
      )}
    </NavigationContainer>
  );
}

/**
 * The launch screen: the mark draws itself, the name fades in under it, and the full logo holds for a
 * second before the app opens. With Reduce Motion on, the still logo shows for the same second.
 */
function LaunchLogo({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReduceMotion();
  const name = React.useRef(new Animated.Value(0)).current;
  const done = React.useRef(onDone);
  done.current = onDone;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const drawn = React.useCallback(() => {
    const hold = () => {
      timer.current = setTimeout(() => done.current(), LOGO_HOLD_MS);
    };
    if (reduceMotion) {
      name.setValue(1);
      hold();
      return;
    }
    Animated.timing(name, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(hold);
  }, [reduceMotion, name]);

  const rise = name.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <View style={s.splash}>
      {/* same size and spot as the native splash's logo, which it then redraws */}
      <AnimatedLogoMark size={84} onDrawn={drawn} />
      <Animated.View style={[s.name, { opacity: name, transform: [{ translateY: rise }] }]} accessible={false}>
        <Text style={s.wordmark}>Vendly</Text>
        <Text style={s.tagline}>MARKETPLACE</Text>
      </Animated.View>
    </View>
  );
}

/** How long the full logo stays up before the app opens. */
const LOGO_HOLD_MS = 1000;

/** The role's "get set up" checklist (shown in notifications) and its welcome / all-set popups. */
function WithOnboarding({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      {children}
      <OnboardingPopup />
    </OnboardingProvider>
  );
}

const s = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Matches the native splash (app.json) so the hand-off is seamless.
    backgroundColor: DARK.bg,
  },
  // under the mark without moving it, so the hand-off from the native splash stays in place
  name: { position: 'absolute', top: '50%', marginTop: 42 + 18, alignItems: 'center' },
  wordmark: { color: '#fff', fontSize: 34, fontFamily: FONTS.extrabold, letterSpacing: -0.6 },
  tagline: { color: '#fff', fontSize: 11, fontFamily: FONTS.medium, letterSpacing: 4.6, marginTop: 8, paddingLeft: 4.6, opacity: 0.85 },
  adminMsg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: COLORS.primaryBg,
  },
  adminTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 12,
  },
  adminSub: {
    fontSize: 15,
    color: COLORS.gray[500],
    textAlign: 'center',
    lineHeight: 22,
  },
});
