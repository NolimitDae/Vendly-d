import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS, DARK } from '../constants/colors';
import { AnimatedLogoMark } from '../components/brand';
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
  // at launch the logo finishes drawing before the app opens (about 1.3s); a timer makes sure a
  // stalled animation can never keep the app on this screen
  const [logoDone, setLogoDone] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setLogoDone(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (loading || !logoDone) {
    return (
      <View style={s.splash}>
        {/* same size and spot as the native splash's logo, which it then redraws */}
        <AnimatedLogoMark size={84} onDrawn={() => setLogoDone(true)} />
      </View>
    );
  }

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
