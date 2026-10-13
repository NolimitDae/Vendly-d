import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS, DARK } from '../constants/colors';
import { LogoMark } from '../components/brand';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { navigationRef } from './navigationRef';

import AuthScreens from './AuthScreens';
import CustomerTabs from './CustomerTabs';
import VendorTabs from './VendorTabs';
import EventPlannerTabs from './EventPlannerTabs';

export default function RootNavigator() {
  const { user, loading } = useAuth();
  usePushNotifications(user?.type);

  if (loading) {
    return (
      <View style={s.splash}>
        <LogoMark size={84} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {!user ? (
        <AuthScreens />
      ) : user.type === 'CUSTOMER' || user.type === 'CLIENT' ? (
        // The website registers customers as CLIENT; both are the same kind of account.
        <CustomerTabs />
      ) : user.type === 'VENDOR' ? (
        <VendorTabs />
      ) : user.type === 'EVENT_PLANNER' ? (
        <EventPlannerTabs />
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
