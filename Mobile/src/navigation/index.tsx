import React from 'react';
import { Animated, Easing, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS } from '../constants/colors';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { LOGO_LENGTH, LOGO_PATH, useReduceMotion } from '../components/brand';
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
  // at launch the full logo plays before the app opens (about 3.4s); a timer makes sure a stalled
  // animation can never keep the app on this screen
  const [logoDone, setLogoDone] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setLogoDone(true), 6000);
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
 * The launch screen, on the light brand pink: the V draws, a beat, then the rest of the M; "Vendly"
 * rises in under it, then "MARKETPLACE", and the full logo holds for a second before the app opens.
 * With Reduce Motion on, the still logo shows for that second.
 */
function LaunchLogo({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReduceMotion();
  // starts a little past the full length: a dash ending exactly at the path's start can leave a round-cap dot
  const offset = React.useRef(new Animated.Value(LOGO_LENGTH + 30)).current;
  const name = React.useRef(new Animated.Value(0)).current;
  const tagline = React.useRef(new Animated.Value(0)).current;
  const done = React.useRef(onDone);
  done.current = onDone;

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hold = () => {
      timer = setTimeout(() => done.current(), LOGO_HOLD_MS);
    };
    if (reduceMotion) {
      offset.setValue(0);
      name.setValue(1);
      tagline.setValue(1);
      hold();
      return () => clearTimeout(timer);
    }
    const ease = Easing.bezier(0.65, 0, 0.35, 1);
    const fadeIn = (value: Animated.Value, delay: number, duration: number) =>
      Animated.timing(value, { toValue: 1, delay, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const anim = Animated.parallel([
      // SVG props can't use the native driver; the JS thread is mostly idle while the app loads
      Animated.sequence([
        Animated.delay(150),
        Animated.timing(offset, { toValue: LOGO_LENGTH - V_LENGTH, duration: 630, easing: ease, useNativeDriver: false }),
        Animated.delay(300),
        Animated.timing(offset, { toValue: 0, duration: 500, easing: ease, useNativeDriver: false }),
      ]),
      fadeIn(name, 1650, 500),
      fadeIn(tagline, 1950, 450),
    ]);
    anim.start(({ finished }) => finished && hold());
    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [reduceMotion, offset, name, tagline]);

  const rise = (value: Animated.Value) => value.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return (
    <View style={s.splash}>
      <StatusBar style="dark" />
      <View style={s.logo} accessible accessibilityLabel="Vendly Marketplace">
        <Svg width={(MARK_HEIGHT * 360) / 220} height={MARK_HEIGHT} viewBox="0 0 360 220">
          <Defs>
            <SvgGradient id="launchMark" x1="0" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#4A1650" />
              <Stop offset="0.5" stopColor="#7A2A82" />
              <Stop offset="1" stopColor="#A84AB0" />
            </SvgGradient>
          </Defs>
          <AnimatedPath
            d={LOGO_PATH}
            fill="none"
            stroke="url(#launchMark)"
            strokeWidth={57}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[LOGO_LENGTH, LOGO_LENGTH * 2]}
            strokeDashoffset={offset}
          />
        </Svg>
        <Animated.Text style={[s.wordmark, { opacity: name, transform: [{ translateY: rise(name) }] }]}>Vendly</Animated.Text>
        <Animated.Text style={[s.tagline, { opacity: tagline, transform: [{ translateY: rise(tagline) }] }]}>MARKETPLACE</Animated.Text>
      </View>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** The mark's height on the launch screen. */
const MARK_HEIGHT = 80;
/** Length of the logo path's first two strokes (the V), drawn before the pause. */
const V_LENGTH = 2 * Math.hypot(78, 163);
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
    backgroundColor: COLORS.primaryBg,
  },
  logo: { alignItems: 'center' },
  wordmark: { color: '#3A1040', fontSize: 50, fontFamily: FONTS.extrabold, letterSpacing: -1, marginTop: 14 },
  tagline: { color: '#3A1040', fontSize: 16, fontFamily: FONTS.medium, letterSpacing: 6.7, paddingLeft: 6.7, marginTop: 4 },
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
