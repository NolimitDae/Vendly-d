import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

import EPHome from '../screens/eventplanner/Home';
import MyEvents from '../screens/eventplanner/Events';
import CreateEvent from '../screens/eventplanner/CreateEvent';
import EventDetail from '../screens/eventplanner/EventDetail';
import Discover from '../screens/eventplanner/Discover';
import EPProfile from '../screens/eventplanner/Profile';
import { View, Text } from 'react-native';
import type { EventPlannerStackParams } from './types';

const Stack = createNativeStackNavigator<EventPlannerStackParams>();
const Tab = createBottomTabNavigator();

function EventsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="EPHome" component={EPHome} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="MyEvents" component={MyEvents} options={{ title: 'My Events' }} />
      <Stack.Screen name="CreateEvent" component={CreateEvent} options={{ title: 'New Event' }} />
      <Stack.Screen
        name="EventDetail"
        component={EventDetail}
        options={({ route }) => ({ title: route.params.eventName })}
      />
    </Stack.Navigator>
  );
}

function DiscoverStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="Discover" component={Discover} options={{ title: 'Find Vendors' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="EPProfile" component={EPProfile} options={{ title: 'My Profile' }} />
    </Stack.Navigator>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: COLORS.gray[500], fontSize: 16 }}>{label} coming soon</Text>
    </View>
  );
}

export default function EventPlannerTabs() {
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
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            EventsTab: 'calendar',
            DiscoverTab: 'search',
            MessagesTab: 'chatbubbles',
            NotificationsTab: 'notifications',
            ProfileTab: 'person',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="EventsTab" component={EventsStack} options={{ title: 'Events' }} />
      <Tab.Screen name="DiscoverTab" component={DiscoverStack} options={{ title: 'Discover' }} />
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
