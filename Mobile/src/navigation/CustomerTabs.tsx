import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, DARK, FONTS } from '../constants/colors';
import { BrandGradient } from '../components/brand';

import CustomerHome from '../screens/customer/Home';
import ListingDetail from '../screens/customer/ListingDetail';
import FindVendors from '../screens/customer/FindVendors';
import PlanEvent from '../screens/customer/PlanEvent';
import SearchResults from '../screens/customer/SearchResults';
import VendorProfile from '../screens/customer/VendorProfile';
import SelectDate from '../screens/customer/SelectDate';
import BookingDetails from '../screens/customer/BookingDetails';
import BookingSummary from '../screens/customer/BookingSummary';
import Reviews from '../screens/customer/Reviews';
import Rentals from '../screens/customer/Rentals';
import RentalItem from '../screens/customer/RentalItem';
import RentalCheckout from '../screens/customer/RentalCheckout';
import EditProfile from '../screens/customer/EditProfile';
import ChangePassword from '../screens/customer/ChangePassword';
import SwitchRole from '../screens/shared/SwitchRole';
import VerifyIdentity from '../screens/shared/VerifyIdentity';
import NotificationSettings from '../screens/customer/NotificationSettings';
import PaymentMethods from '../screens/customer/PaymentMethods';
import Transactions from '../screens/shared/Transactions';
import SharedEvents from '../screens/shared/SharedEvents';
import Inbox from '../screens/shared/Inbox';
import EventShared from '../screens/shared/EventShared';
import PlannerPublic from '../screens/shared/PlannerPublic';
import FaqScreen from '../screens/shared/Faq';
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
// every page slides in from the right, the same on iPhone and Android (Android's default rises from the bottom)
const SLIDE = { animation: 'slide_from_right' as const };

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ ...HEADER, ...SLIDE, contentStyle: { backgroundColor: DARK.bg } }}>
      <HomeStack.Screen name="CustomerHome" component={CustomerHome} options={{ headerShown: false }} />
      <HomeStack.Screen name="Notifications" component={Inbox} options={{ headerShown: false }} />
      <HomeStack.Screen name="FindVendors" component={FindVendors} options={{ headerShown: false }} />
      <HomeStack.Screen name="PlanEvent" component={PlanEvent} options={{ headerShown: false }} />
      <HomeStack.Screen name="SearchResults" component={SearchResults} options={{ headerShown: false }} />
      <HomeStack.Screen name="ListingDetail" component={ListingDetail} options={{ headerShown: false }} />
      <HomeStack.Screen name="VendorProfile" component={VendorProfile} options={{ headerShown: false }} />
      <HomeStack.Screen name="SelectDate" component={SelectDate} options={{ headerShown: false }} />
      <HomeStack.Screen name="BookingDetails" component={BookingDetails} options={{ headerShown: false }} />
      <HomeStack.Screen name="BookingSummary" component={BookingSummary} options={{ headerShown: false }} />
      <HomeStack.Screen name="Reviews" component={Reviews} options={{ headerShown: false }} />
      <HomeStack.Screen name="Rentals" component={Rentals} options={{ headerShown: false }} />
      <HomeStack.Screen name="RentalItem" component={RentalItem} options={{ headerShown: false }} />
      <HomeStack.Screen name="RentalCheckout" component={RentalCheckout} options={{ headerShown: false }} />
    </HomeStack.Navigator>
  );
}

function BookingsNavigator() {
  return (
    <BookingsStack.Navigator screenOptions={{ ...HEADER, ...SLIDE, contentStyle: { backgroundColor: DARK.bg } }}>
      <BookingsStack.Screen name="CustomerBookings" component={CustomerBookings} options={{ headerShown: false }} />
      <BookingsStack.Screen name="BookingDetail" component={BookingDetail} options={{ headerShown: false }} />
      <BookingsStack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Secure Payment' }} />
    </BookingsStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MessagesStack.Navigator screenOptions={{ headerShown: false, ...SLIDE, contentStyle: { backgroundColor: DARK.bg } }}>
      <MessagesStack.Screen name="ChatList" component={ChatList} />
      <MessagesStack.Screen name="ChatDetail" component={ChatDetail} />
      {/* booking a quote from a chat stays on this tab, so Back returns to the chat */}
      <MessagesStack.Screen name="SelectDate" component={SelectDate as React.ComponentType<any>} />
      <MessagesStack.Screen name="BookingDetails" component={BookingDetails as React.ComponentType<any>} />
      <MessagesStack.Screen name="BookingSummary" component={BookingSummary as React.ComponentType<any>} />
    </MessagesStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, ...SLIDE, contentStyle: { backgroundColor: DARK.bg } }}>
      <ProfileStack.Screen name="CustomerProfile" component={CustomerProfile} />
      <ProfileStack.Screen name="EditProfile" component={EditProfile} />
      <ProfileStack.Screen name="ChangePassword" component={ChangePassword} />
      <ProfileStack.Screen name="SwitchRole" component={SwitchRole} />
      <ProfileStack.Screen name="VerifyIdentity" component={VerifyIdentity} />
      <ProfileStack.Screen name="Notifications" component={NotificationSettings} />
      <ProfileStack.Screen name="PaymentMethods" component={PaymentMethods} />
      <ProfileStack.Screen name="Transactions" component={Transactions} />
      <ProfileStack.Screen name="SharedEvents" component={SharedEvents} />
      <ProfileStack.Screen name="EventShared" component={EventShared} />
      <ProfileStack.Screen name="PlannerPublic" component={PlannerPublic} />
      <ProfileStack.Screen name="Faq" component={FaqScreen} />
    </ProfileStack.Navigator>
  );
}


const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home-outline',
  MessagesTab: 'chatbubble-ellipses-outline',
  BookingsTab: 'calendar-outline',
  ProfileTab: 'ellipsis-vertical',
};

const tabStyles = { active: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const } };

export default function CustomerTabs() {
  const insets = useSafeAreaInsets();
  const tabBarStyle = {
    backgroundColor: DARK.card,
    borderTopWidth: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: 64 + insets.bottom,
    paddingTop: 8,
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: DARK.muted,
        tabBarStyle,
        tabBarLabelStyle: { fontSize: 12, fontFamily: FONTS.medium, marginTop: 4 },
        tabBarIcon: ({ color, focused }) => {
          const icon = <Ionicons name={TAB_ICONS[route.name] ?? 'ellipse'} size={22} color={color} />;
          return focused ? <BrandGradient style={tabStyles.active}>{icon}</BrandGradient> : icon;
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeNavigator}
        options={({ route }) => ({
          title: 'Home',
          // Browse and booking screens have their own footer buttons, so the tab bar hides past the home screen.
          tabBarStyle: [tabBarStyle, { display: ['CustomerHome', undefined].includes(getFocusedRouteNameFromRoute(route)) ? 'flex' : 'none' }],
        })}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesNavigator}
        options={({ route }) => ({
          title: 'Message',
          tabBarStyle: [tabBarStyle, { display: ['ChatList', undefined].includes(getFocusedRouteNameFromRoute(route)) ? 'flex' : 'none' }],
        })}
      />
      <Tab.Screen
        name="BookingsTab"
        component={BookingsNavigator}
        options={({ route }) => ({
          title: 'Booking',
          tabBarStyle: [tabBarStyle, { display: ['CustomerBookings', undefined].includes(getFocusedRouteNameFromRoute(route)) ? 'flex' : 'none' }],
        })}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileNavigator}
        options={({ route }) => ({
          title: 'More',
          tabBarStyle: [tabBarStyle, { display: ['CustomerProfile', undefined].includes(getFocusedRouteNameFromRoute(route)) ? 'flex' : 'none' }],
        })}
      />
    </Tab.Navigator>
  );
}
