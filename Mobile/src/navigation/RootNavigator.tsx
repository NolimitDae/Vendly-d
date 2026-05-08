import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import EventPlannerTabs from './EventPlannerTabs';
import { COLORS } from '../constants/colors';

// Placeholder auth screens — replace with your real login/register screens
import AuthScreens from './AuthScreens';

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthScreens />
      ) : user.type === 'EVENT_PLANNER' ? (
        <EventPlannerTabs />
      ) : (
        // Placeholder for other user types (CUSTOMER, VENDOR, etc.)
        <EventPlannerTabs />
      )}
    </NavigationContainer>
  );
}
