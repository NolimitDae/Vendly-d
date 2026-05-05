import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

import CustomerHome from '../screens/customer/Home';
import ListingDetail from '../screens/customer/ListingDetail';
import CustomerBookings from '../screens/customer/Bookings';
import BookingDetail from '../screens/customer/BookingDetail';
import PaymentScreen from '../screens/customer/PaymentScreen';
import CustomerProfile from '../screens/customer/Profile';
import ChatList from '../screens/customer/ChatList';
import ChatDetail from '../screens/customer/ChatDetail';

import type {
  CustomerTabParams,
  CustomerHomeStackParams,
  CustomerBookingsStackParams,
  CustomerProfileStackParams,
  CustomerMessagesStackParams,
} from './types';

const Tab = createBottomTabNavigator<CustomerTabParams>();
const HomeStack = createNativeStackNavigator<CustomerHomeStackParams>();
const BookingsStack = createNativeStackNavigator<CustomerBookingsStackParams>();
const ProfileStack = createNativeStackNavigator<CustomerProfileStackParams>();
const MessagesStack = createNativeStackNavigator<CustomerMessagesStackParams>();

const HEADER = {
  headerStyle: { backgroundColor: COLORS.primary },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '700' as const },
};

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={HEADER}>
      <HomeStack.Screen name="CustomerHome" component={CustomerHome} options={{ title: 'Marketplace' }} />
      <HomeStack.Screen name="ListingDetail" component={ListingDetail} options={{ title: 'Listing Details' }} />
    </HomeStack.Navigator>
  );
}

function BookingsNavigator() {
  return (
    <BookingsStack.Navigator screenOptions={HEADER}>
      <BookingsStack.Screen name="CustomerBookings" component={CustomerBookings} options={{ title: 'My Bookings' }} />
      <BookingsStack.Screen name="BookingDetail" component={BookingDetail} options={{ title: 'Booking Details' }} />
      <BookingsStack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Secure Payment' }} />
    </BookingsStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MessagesStack.Navigator screenOptions={HEADER}>
      <MessagesStack.Screen name="ChatList" component={ChatList} options={{ title: 'Messages' }} />
      <MessagesStack.Screen name="ChatDetail" component={ChatDetail} options={{ title: 'Chat' }} />
    </MessagesStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={HEADER}>
      <ProfileStack.Screen name="CustomerProfile" component={CustomerProfile} options={{ title: 'My Profile' }} />
    </ProfileStack.Navigator>
  );
}

function NotificationsPlaceholder() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="notifications-outline" size={48} color={COLORS.gray[300]} />
      <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: COLORS.gray[500] }}>
        Notifications
      </Text>
      <Text style={{ marginTop: 4, fontSize: 13, color: COLORS.gray[400] }}>Coming soon</Text>
    </View>
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
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ title: 'Home' }} />
      <Tab.Screen name="BookingsTab" component={BookingsNavigator} options={{ title: 'Bookings' }} />
      <Tab.Screen name="MessagesTab" component={MessagesNavigator} options={{ title: 'Messages' }} />
      <Tab.Screen name="NotificationsTab" component={NotificationsPlaceholder} options={{ title: 'Alerts' }} />
      <Tab.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
