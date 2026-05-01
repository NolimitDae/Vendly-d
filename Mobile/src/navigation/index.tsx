import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/colors';
import { usePushNotifications } from '../hooks/usePushNotifications';

import AuthScreens from './AuthScreens';
import CustomerTabs from './CustomerTabs';
import VendorTabs from './VendorTabs';
import EventPlannerTabs from './EventPlannerTabs';

export default function RootNavigator() {
  const { user, loading } = useAuth();
  usePushNotifications();

  if (loading) {
    return (
      <View style={s.splash}>
        <Text style={s.splashTitle}>Vendly</Text>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthScreens />
      ) : user.type === 'CUSTOMER' ? (
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
    backgroundColor: COLORS.primaryBg,
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
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
