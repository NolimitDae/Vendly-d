import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DARK, FONTS } from '../constants/colors';
import { BrandGradient } from '../components/brand';

import EPHome from '../screens/eventplanner/Home';
import MyEvents from '../screens/eventplanner/Events';
import CreateEvent from '../screens/eventplanner/CreateEvent';
import EventDetail from '../screens/eventplanner/EventDetail';
import EPProfile from '../screens/eventplanner/Profile';
import PlannerProfile from '../screens/eventplanner/PlannerProfile';
import FindVendors from '../screens/customer/FindVendors';
import SearchResults from '../screens/customer/SearchResults';
import ListingDetail from '../screens/customer/ListingDetail';
import VendorProfile from '../screens/customer/VendorProfile';
import SelectDate from '../screens/customer/SelectDate';
import BookingDetails from '../screens/customer/BookingDetails';
import BookingSummary from '../screens/customer/BookingSummary';
import Reviews from '../screens/customer/Reviews';
import CustomerBookings from '../screens/customer/Bookings';
import BookingDetail from '../screens/customer/BookingDetail';
import ChatList from '../screens/customer/ChatList';
import ChatDetail from '../screens/customer/ChatDetail';
import EditProfile from '../screens/customer/EditProfile';
import ChangePassword from '../screens/customer/ChangePassword';
import NotificationSettings from '../screens/customer/NotificationSettings';
import Inbox from '../screens/shared/Inbox';
import PaymentMethods from '../screens/customer/PaymentMethods';

import type { EPTabParams } from './types';

const Tab = createBottomTabNavigator<EPTabParams>();
// The home stack mixes planner screens with the customer booking screens, so it is typed loosely.
const HomeStack = createNativeStackNavigator<any>();
const BookStack = createNativeStackNavigator<any>();
const MsgStack = createNativeStackNavigator<any>();
const ProfileStack = createNativeStackNavigator<any>();

const STACK = { headerShown: false, contentStyle: { backgroundColor: DARK.bg } };

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={STACK}>
      <HomeStack.Screen name="EPHome" component={EPHome} />
      <HomeStack.Screen name="MyEvents" component={MyEvents} />
      <HomeStack.Screen name="CreateEvent" component={CreateEvent} />
      <HomeStack.Screen name="EventDetail" component={EventDetail} />
      <HomeStack.Screen name="FindVendors" component={FindVendors as React.ComponentType<any>} />
      <HomeStack.Screen name="SearchResults" component={SearchResults as React.ComponentType<any>} />
      <HomeStack.Screen name="ListingDetail" component={ListingDetail as React.ComponentType<any>} />
      <HomeStack.Screen name="VendorProfile" component={VendorProfile as React.ComponentType<any>} />
      <HomeStack.Screen name="SelectDate" component={SelectDate as React.ComponentType<any>} />
      <HomeStack.Screen name="BookingDetails" component={BookingDetails as React.ComponentType<any>} />
      <HomeStack.Screen name="BookingSummary" component={BookingSummary as React.ComponentType<any>} />
      <HomeStack.Screen name="Reviews" component={Reviews as React.ComponentType<any>} />
    </HomeStack.Navigator>
  );
}

function BookingsNavigator() {
  return (
    <BookStack.Navigator screenOptions={STACK}>
      <BookStack.Screen name="CustomerBookings" component={CustomerBookings} />
      <BookStack.Screen name="BookingDetail" component={BookingDetail} />
    </BookStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MsgStack.Navigator screenOptions={STACK}>
      <MsgStack.Screen name="ChatList" component={ChatList} />
      <MsgStack.Screen name="ChatDetail" component={ChatDetail} />
    </MsgStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={STACK}>
      <ProfileStack.Screen name="EPProfile" component={EPProfile} />
      <ProfileStack.Screen name="PlannerProfile" component={PlannerProfile} />
      <ProfileStack.Screen name="EditProfile" component={EditProfile} />
      <ProfileStack.Screen name="ChangePassword" component={ChangePassword} />
      <ProfileStack.Screen name="Notifications" component={NotificationSettings} />
      <ProfileStack.Screen name="Inbox" component={Inbox} />
      <ProfileStack.Screen name="PaymentMethods" component={PaymentMethods} />
    </ProfileStack.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home-outline',
  MessagesTab: 'chatbubble-ellipses-outline',
  BookingsTab: 'calendar-outline',
  ProfileTab: 'ellipsis-vertical',
};
const ROOTS: Record<string, string> = { HomeTab: 'EPHome', MessagesTab: 'ChatList', BookingsTab: 'CustomerBookings', ProfileTab: 'EPProfile' };

export default function EventPlannerTabs() {
  const insets = useSafeAreaInsets();
  const tabBarStyle = { backgroundColor: DARK.card, borderTopWidth: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, height: 64 + insets.bottom, paddingTop: 8 };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: DARK.muted,
        tabBarStyle: [tabBarStyle, { display: [ROOTS[route.name], undefined].includes(getFocusedRouteNameFromRoute(route)) ? 'flex' : 'none' }],
        tabBarLabelStyle: { fontSize: 12, fontFamily: FONTS.medium, marginTop: 4 },
        tabBarIcon: ({ color, focused }) => {
          const icon = <Ionicons name={TAB_ICONS[route.name] ?? 'ellipse'} size={22} color={color} />;
          return focused ? <BrandGradient style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>{icon}</BrandGradient> : icon;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ title: 'Home' }} />
      <Tab.Screen name="MessagesTab" component={MessagesNavigator} options={{ title: 'Message' }} />
      <Tab.Screen name="BookingsTab" component={BookingsNavigator} options={{ title: 'Booking' }} />
      <Tab.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}
