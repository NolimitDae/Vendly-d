import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { DARK } from '../constants/colors';

import VendorDashboard from '../screens/vendor/Dashboard';
import VendorListings from '../screens/vendor/Listings';
import ListingForm from '../screens/vendor/ListingForm';
import AddOns from '../screens/vendor/AddOns';
import Availability from '../screens/vendor/Availability';
import RentalInventory from '../screens/vendor/RentalInventory';
import RentalItemForm from '../screens/vendor/RentalItemForm';
import RentalItemDetail from '../screens/vendor/RentalItemDetail';
import VendorBookings from '../screens/vendor/Bookings';
import VendorBookingDetail from '../screens/vendor/BookingDetail';
import EventShared from '../screens/shared/EventShared';
import PlannerPublic from '../screens/shared/PlannerPublic';
import VendorContracts from '../screens/vendor/Contracts';
import VendorProfile from '../screens/vendor/Profile';
import Payouts from '../screens/vendor/Payouts';
import Transactions from '../screens/shared/Transactions';
import License from '../screens/vendor/License';
import CalendarSync from '../screens/vendor/CalendarSync';
import WorkingHours from '../screens/vendor/WorkingHours';
import VendorReviews from '../screens/vendor/Reviews';
import PromoCodes from '../screens/vendor/PromoCodes';
import ChatList from '../screens/customer/ChatList';
import ChatDetail from '../screens/customer/ChatDetail';
import EditProfile from '../screens/customer/EditProfile';
import ChangePassword from '../screens/customer/ChangePassword';
import SwitchRole from '../screens/shared/SwitchRole';
import VerifyIdentity from '../screens/shared/VerifyIdentity';
import NotificationSettings from '../screens/customer/NotificationSettings';
import Inbox from '../screens/shared/Inbox';

import type {
  VendorTabParams,
  VendorDashboardStackParams,
  VendorBookingsStackParams,
  VendorProfileStackParams,
  VendorMessagesStackParams,
} from './types';
import { backToOrigin } from './crossTab';
import FloatingTabBar from '../components/FloatingTabBar';

const Tab = createBottomTabNavigator<VendorTabParams>();
const DashStack = createNativeStackNavigator<VendorDashboardStackParams>();
const BookStack = createNativeStackNavigator<VendorBookingsStackParams>();
const ProfileStack = createNativeStackNavigator<VendorProfileStackParams>();
const MsgStack = createNativeStackNavigator<VendorMessagesStackParams>();

// every page slides in from the right, the same on iPhone and Android (Android's default rises from the bottom)
const STACK = { headerShown: false, contentStyle: { backgroundColor: DARK.bg }, animation: 'slide_from_right' as const };

function DashboardNavigator() {
  return (
    <DashStack.Navigator screenListeners={backToOrigin} screenOptions={STACK}>
      <DashStack.Screen name="VendorDashboard" component={VendorDashboard} />
      <DashStack.Screen name="VendorListings" component={VendorListings} />
      <DashStack.Screen name="ListingForm" component={ListingForm} />
      <DashStack.Screen name="Availability" component={Availability} />
      <DashStack.Screen name="RentalInventory" component={RentalInventory} />
      <DashStack.Screen name="RentalItemForm" component={RentalItemForm} />
      <DashStack.Screen name="RentalItemDetail" component={RentalItemDetail} />
      <DashStack.Screen name="AddOns" component={AddOns} />
    </DashStack.Navigator>
  );
}

function BookingsNavigator() {
  return (
    <BookStack.Navigator screenListeners={backToOrigin} screenOptions={STACK}>
      <BookStack.Screen name="VendorBookings" component={VendorBookings} />
      <BookStack.Screen name="VendorBookingDetail" component={VendorBookingDetail} />
      <BookStack.Screen name="EventShared" component={EventShared} />
      <BookStack.Screen name="PlannerPublic" component={PlannerPublic} />
    </BookStack.Navigator>
  );
}

function MessagesNavigator() {
  return (
    <MsgStack.Navigator screenListeners={backToOrigin} screenOptions={STACK}>
      <MsgStack.Screen name="ChatList" component={ChatList} />
      <MsgStack.Screen name="ChatDetail" component={ChatDetail} />
    </MsgStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenListeners={backToOrigin} screenOptions={STACK}>
      <ProfileStack.Screen name="VendorProfile" component={VendorProfile} />
      <ProfileStack.Screen name="VendorContracts" component={VendorContracts} />
      <ProfileStack.Screen name="Payouts" component={Payouts} />
      <ProfileStack.Screen name="Transactions" component={Transactions} />
      <ProfileStack.Screen name="License" component={License} />
      <ProfileStack.Screen name="CalendarSync" component={CalendarSync} />
      <ProfileStack.Screen name="WorkingHours" component={WorkingHours} />
      <ProfileStack.Screen name="EditProfile" component={EditProfile} />
      <ProfileStack.Screen name="ChangePassword" component={ChangePassword} />
      <ProfileStack.Screen name="SwitchRole" component={SwitchRole} />
      <ProfileStack.Screen name="VerifyIdentity" component={VerifyIdentity} />
      <ProfileStack.Screen name="Notifications" component={NotificationSettings} />
      <ProfileStack.Screen name="Inbox" component={Inbox} />
      <ProfileStack.Screen name="VendorReviews" component={VendorReviews} />
      <ProfileStack.Screen name="PromoCodes" component={PromoCodes} />
    </ProfileStack.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  DashboardTab: 'home-outline',
  MessagesTab: 'chatbubble-ellipses-outline',
  BookingsTab: 'calendar-outline',
  ProfileTab: 'ellipsis-vertical',
};

// Each tab's first screen shows the tab bar; deeper screens have their own footer buttons.
const ROOTS: Record<string, string> = {
  DashboardTab: 'VendorDashboard',
  MessagesTab: 'ChatList',
  BookingsTab: 'VendorBookings',
  ProfileTab: 'VendorProfile',
};

export default function VendorTabs() {
  return (
    <Tab.Navigator
      // Android back at a tab's first page returns to the tab used before, not always the first tab
      backBehavior="history"
      // the floating bar with the sliding highlight (components/FloatingTabBar.tsx)
      tabBar={(props) => <FloatingTabBar {...props} icons={TAB_ICONS} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        // only each tab's first screen shows the bar
        tabBarStyle: { display: [ROOTS[route.name], undefined].includes(getFocusedRouteNameFromRoute(route)) ? 'flex' : 'none' },
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashboardNavigator} options={{ title: 'Home' }} />
      <Tab.Screen name="MessagesTab" component={MessagesNavigator} options={{ title: 'Message' }} />
      <Tab.Screen name="BookingsTab" component={BookingsNavigator} options={{ title: 'Booking' }} />
      <Tab.Screen name="ProfileTab" component={ProfileNavigator} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}
