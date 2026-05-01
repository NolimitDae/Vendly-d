import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import type { VendorTabParams } from './types';

const Tab = createBottomTabNavigator<VendorTabParams>();
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

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="VendorDashboard"
        options={{ title: 'Dashboard' }}
        children={() => <Placeholder label="Vendor Dashboard" />}
      />
    </Stack.Navigator>
  );
}

function ListingsStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="VendorListings"
        options={{ title: 'My Listings' }}
        children={() => <Placeholder label="My Listings" />}
      />
    </Stack.Navigator>
  );
}

function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="VendorBookings"
        options={{ title: 'Bookings' }}
        children={() => <Placeholder label="Bookings" />}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="VendorProfile"
        options={{ title: 'My Profile' }}
        children={() => <Placeholder label="My Profile" />}
      />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  DashboardTab: 'stats-chart',
  ListingsTab: 'pricetag',
  BookingsTab: 'receipt',
  MessagesTab: 'chatbubbles',
  ProfileTab: 'person',
};

export default function VendorTabs() {
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
      <Tab.Screen name="DashboardTab" component={DashboardStack} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="ListingsTab" component={ListingsStack} options={{ title: 'Listings' }} />
      <Tab.Screen name="BookingsTab" component={BookingsStack} options={{ title: 'Bookings' }} />
      <Tab.Screen
        name="MessagesTab"
        options={{ title: 'Messages' }}
        children={() => <Placeholder label="Messages" />}
      />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
