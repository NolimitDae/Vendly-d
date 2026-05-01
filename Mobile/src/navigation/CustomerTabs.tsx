import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import type { CustomerTabParams } from './types';

const Tab = createBottomTabNavigator<CustomerTabParams>();
const Stack = createNativeStackNavigator();

const HEADER = {
  headerStyle: { backgroundColor: COLORS.primary },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '700' as const },
};

function Placeholder({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="construct-outline" size={40} color={COLORS.gray[300]} />
      <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: COLORS.gray[500] }}>
        {label}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 13, color: COLORS.gray[400] }}>Coming soon</Text>
    </View>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="CustomerHome"
        options={{ title: 'Marketplace' }}
        children={() => <Placeholder label="Marketplace" />}
      />
    </Stack.Navigator>
  );
}

function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="CustomerBookings"
        options={{ title: 'My Bookings' }}
        children={() => <Placeholder label="My Bookings" />}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="CustomerProfile"
        options={{ title: 'My Profile' }}
        children={() => <Placeholder label="My Profile" />}
      />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home',
  BookingsTab: 'receipt',
  MessagesTab: 'chatbubbles',
  NotificationsTab: 'notifications',
  ProfileTab: 'person',
};

export default function CustomerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray[400],
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.gray[200],
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] ?? 'ellipse'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: 'Home' }} />
      <Tab.Screen name="BookingsTab" component={BookingsStack} options={{ title: 'Bookings' }} />
      <Tab.Screen
        name="MessagesTab"
        options={{ title: 'Messages' }}
        children={() => <Placeholder label="Messages" />}
      />
      <Tab.Screen
        name="NotificationsTab"
        options={{ title: 'Alerts' }}
        children={() => <Placeholder label="Notifications" />}
      />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
