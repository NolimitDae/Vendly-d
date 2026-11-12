import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DARK } from '../constants/colors';
import CustomerHome from '../screens/customer/Home';
import ListingDetail from '../screens/customer/ListingDetail';
import FindVendors from '../screens/customer/FindVendors';
import PlanEvent from '../screens/customer/PlanEvent';
import SearchResults from '../screens/customer/SearchResults';
import VendorProfile from '../screens/customer/VendorProfile';
import Reviews from '../screens/customer/Reviews';
import Rentals from '../screens/customer/Rentals';
import RentalItem from '../screens/customer/RentalItem';
import SignInWall from '../screens/shared/SignInWall';
import type { CustomerHomeStackParams } from './types';

const Stack = createNativeStackNavigator<CustomerHomeStackParams>();

/**
 * Looking around without an account: the customer's home, search, vendors, packages, reviews and
 * rentals. Booking, renting and notifications open the sign-in wall instead.
 */
export default function GuestScreens() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: DARK.bg } }}>
      <Stack.Screen name="CustomerHome" component={CustomerHome} />
      <Stack.Screen name="FindVendors" component={FindVendors} />
      <Stack.Screen name="PlanEvent" component={PlanEvent} />
      <Stack.Screen name="SearchResults" component={SearchResults} />
      <Stack.Screen name="ListingDetail" component={ListingDetail} />
      <Stack.Screen name="VendorProfile" component={VendorProfile} />
      <Stack.Screen name="Reviews" component={Reviews} />
      <Stack.Screen name="Rentals" component={Rentals} />
      <Stack.Screen name="RentalItem" component={RentalItem} />
      <Stack.Screen name="SelectDate" component={SignInWall} />
      <Stack.Screen name="BookingDetails" component={SignInWall} />
      <Stack.Screen name="BookingSummary" component={SignInWall} />
      <Stack.Screen name="RentalCheckout" component={SignInWall} />
      <Stack.Screen name="Notifications" component={SignInWall} />
    </Stack.Navigator>
  );
}
