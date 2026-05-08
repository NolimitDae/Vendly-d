import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

import VendorDashboard from '../screens/vendor/Dashboard';
import VendorListings from '../screens/vendor/Listings';
import ListingForm from '../screens/vendor/ListingForm';
import VendorBookings from '../screens/vendor/Bookings';
import VendorBookingDetail from '../screens/vendor/BookingDetail';
import VendorProfile from '../screens/vendor/Profile';
import ChatList from '../screens/customer/ChatList';
import ChatDetail from '../screens/customer/ChatDetail';

import type {
  VendorTabParams,
  VendorDashboardStackParams,
  VendorListingsStackParams,
  VendorBookingsStackParams,
  VendorProfileStackParams,
  VendorMessagesStackParams,
} from './types';

const Tab = createBottomTabNavigator<VendorTabParams>();
const DashStack = createNativeStackNavigator<VendorDashboardStackParams>();
const ListStack = createNativeStackNavigator<VendorListingsStackParams>();
const BookStack = createNativeStackNavigator<VendorBookingsStackParams>();
const ProfileStack = createNativeStackNavigator<VendorProfileStackParams>();
const MsgStack = createNativeStackNavigator<VendorMessagesStackParams>();

const HEADER = {
  headerStyle: { backgroundColor: COLORS.primary },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '700' as const },
};

function DashboardNavigator() {
  return (
    <DashStack.Navigator screenOptions={HEADER}>
      <DashStack.Screen name="VendorDashboard" component={VendorDashboard} options={{ title: 'Dashboard' }} />
    </DashStack.Navigator>
  );
}

function ListingsNavigator() {
  return (
    <ListStack.Navigator screenOptions={HEADER}>
      <ListStack.Screen name="VendorListings" component={VendorListings} options={{ title: 'My Listings' }} />
      <ListStack.Screen name="ListingForm" component={ListingForm} options={{ title: 'Listing' }} />
    </ListStack.Navigator>
  );
}

function BookingsNavigator() {
  return (
    <BookStack.Navigator screenOptions={HEADER}>
      <BookStack.Screen name="VendorBookings" component={VendorBookings} options={{ title: 'Bookings' }} />
      <BookStack.Screen name="VendorBookingDetail" component={VendorBookingDetail} options={{ title: 'Booking Details' }} />
    </BookStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MsgStack.Navigator screenOptions={HEADER}>
      <MsgStack.Screen name="ChatList" component={ChatList} options={{ title: 'Messages' }} />
      <MsgStack.Screen name="ChatDetail" component={ChatDetail} options={{ title: 'Chat' }} />
    </MsgStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={HEADER}>
      <ProfileStack.Screen name="VendorProfile" component={VendorProfile} options={{ title: 'My Profile' }} />
    </ProfileStack.Navigator>
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
      <Tab.Screen name="DashboardTab" component={DashboardNavigator} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="ListingsTab" component={ListingsNavigator} options={{ title: 'Listings' }} />
      <Tab.Screen name="BookingsTab" component={BookingsNavigator} options={{ title: 'Bookings' }} />
      <Tab.Screen name="MessagesTab" component={MessagesNavigator} options={{ title: 'Messages' }} />
      <Tab.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
