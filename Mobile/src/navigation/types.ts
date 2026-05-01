import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ─── Event Planner ───────────────────────────────────────────────────────────

export type EventPlannerStackParams = {
  EPHome: undefined;
  MyEvents: undefined;
  CreateEvent: undefined;
  EventDetail: { eventId: string; eventName: string };
  EPProfile: undefined;
};

export type DiscoverStackParams = {
  Discover: { eventId?: string } | undefined;
};

export type EPTabParams = {
  EventsTab: undefined;
  DiscoverTab: undefined;
  MessagesTab: undefined;
  NotificationsTab: undefined;
  ProfileTab: undefined;
};

// ─── Customer ────────────────────────────────────────────────────────────────

export type CustomerHomeStackParams = {
  CustomerHome: undefined;
  ListingDetail: { listingId: string };
};

export type CustomerBookingsStackParams = {
  CustomerBookings: undefined;
  BookingDetail: { bookingId: string };
};

export type CustomerProfileStackParams = {
  CustomerProfile: undefined;
};

export type CustomerTabParams = {
  HomeTab: undefined;
  BookingsTab: undefined;
  MessagesTab: undefined;
  NotificationsTab: undefined;
  ProfileTab: undefined;
};

// ─── Vendor ──────────────────────────────────────────────────────────────────

export type VendorDashboardStackParams = {
  VendorDashboard: undefined;
};

export type VendorListingsStackParams = {
  VendorListings: undefined;
  ListingForm: { listingId?: string } | undefined;
};

export type VendorBookingsStackParams = {
  VendorBookings: undefined;
  VendorBookingDetail: { bookingId: string };
};

export type VendorProfileStackParams = {
  VendorProfile: undefined;
};

export type VendorTabParams = {
  DashboardTab: undefined;
  ListingsTab: undefined;
  BookingsTab: undefined;
  MessagesTab: undefined;
  ProfileTab: undefined;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type AuthStackParams = {
  Login: undefined;
  Register: undefined;
};

// ─── Screen props ─────────────────────────────────────────────────────────────

export type EPHomeProps = NativeStackScreenProps<EventPlannerStackParams, 'EPHome'>;
export type MyEventsProps = NativeStackScreenProps<EventPlannerStackParams, 'MyEvents'>;
export type CreateEventProps = NativeStackScreenProps<EventPlannerStackParams, 'CreateEvent'>;
export type EventDetailProps = NativeStackScreenProps<EventPlannerStackParams, 'EventDetail'>;

export type CustomerHomeProps = NativeStackScreenProps<CustomerHomeStackParams, 'CustomerHome'>;
export type CustomerBookingsProps = NativeStackScreenProps<CustomerBookingsStackParams, 'CustomerBookings'>;
export type BookingDetailProps = NativeStackScreenProps<CustomerBookingsStackParams, 'BookingDetail'>;

export type VendorDashboardProps = NativeStackScreenProps<VendorDashboardStackParams, 'VendorDashboard'>;
export type VendorListingsProps = NativeStackScreenProps<VendorListingsStackParams, 'VendorListings'>;
export type VendorBookingsProps = NativeStackScreenProps<VendorBookingsStackParams, 'VendorBookings'>;
