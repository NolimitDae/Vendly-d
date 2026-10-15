import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ─── Event Planner ───────────────────────────────────────────────────────────

export type EventPlannerStackParams = {
  EPHome: undefined;
  MyEvents: undefined;
  CreateEvent: undefined;
  EventDetail: { eventId: string; eventName: string };
  PlannerProfile: undefined;
};

export type EPTabParams = {
  HomeTab: undefined;
  MessagesTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
};

// ─── Customer ────────────────────────────────────────────────────────────────

/** Enough of a listing to render the booking screens without refetching. */
export type ListingSummary = {
  id: string;
  title: string;
  price: number;
  priceUnit?: string;
  image?: string;
  vendorId: string;
  vendorName: string;
  rating?: number | null;
  reviewCount?: number;
  /** Event planners book on behalf of one of their events. */
  eventId?: string;
  /** Booking a vendor's custom quote from chat: price is the quoted amount. */
  quoteId?: string;
  quoteTitle?: string;
};

export type BookingDraft = {
  /** yyyy-MM-dd */
  date: string;
  /** ISO datetime */
  startAt: string;
  endAt: string;
  durationLabel: string;
  venue: string;
  guests?: number;
  notes?: string;
};

export type CustomerHomeStackParams = {
  CustomerHome: undefined;
  Notifications: undefined;
  FindVendors: { eventId?: string } | undefined;
  SearchResults: { q?: string; categoryId?: string; categoryName?: string; location?: string; eventId?: string; filters?: import('../components/SearchFilters').Filters };
  ListingDetail: { listingId: string; eventId?: string };
  VendorProfile: { vendorId: string };
  SelectDate: { listing: ListingSummary };
  BookingDetails: { listing: ListingSummary; date: string };
  BookingSummary: { listing: ListingSummary; draft: BookingDraft };
  Reviews: { listingId: string; title: string };
  Rentals: { vendorId?: string; vendorName?: string } | undefined;
  RentalItem: { itemId: string };
  RentalCheckout: {
    vendorId: string;
    vendorName: string;
    /** yyyy-MM-dd */
    startDate: string;
    endDate: string;
    lines: { item_id: string; quantity: number; title: string; image?: string; daily_rate: number }[];
  };
};

export type CustomerBookingsStackParams = {
  CustomerBookings: undefined;
  BookingDetail: { bookingId: string };
  Payment: { bookingId: string; amount: number; currency: string };
};

export type CustomerProfileStackParams = {
  CustomerProfile: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  Notifications: undefined;
  PaymentMethods: undefined;
  SharedEvents: undefined;
  EventShared: { eventId: string };
};

export type CustomerMessagesStackParams = {
  ChatList: undefined;
  ChatDetail: { conversationId: string; participantName: string; avatar?: string };
};

export type CustomerTabParams = {
  HomeTab: undefined;
  MessagesTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
};

// ─── Vendor ──────────────────────────────────────────────────────────────────

export type VendorDashboardStackParams = {
  VendorDashboard: undefined;
  VendorListings: undefined;
  ListingForm: { listingId?: string } | undefined;
  Availability: { listingId: string; title: string };
  RentalInventory: undefined;
  RentalItemForm: { itemId?: string } | undefined;
  RentalItemDetail: { itemId: string };
};

/** Kept for the listing form's route typing; the screens now live in the dashboard stack. */
export type VendorListingsStackParams = VendorDashboardStackParams;

export type VendorBookingsStackParams = {
  VendorBookings: undefined;
  VendorBookingDetail: { bookingId: string };
  EventShared: { eventId: string };
};

export type VendorProfileStackParams = {
  VendorProfile: undefined;
  VendorContracts: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  Notifications: undefined;
  Payouts: undefined;
  License: undefined;
  Inbox: undefined;
};

export type VendorMessagesStackParams = {
  ChatList: undefined;
  ChatDetail: { conversationId: string; participantName: string; avatar?: string };
};

export type VendorTabParams = {
  DashboardTab: undefined;
  MessagesTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type SignupRole = 'CLIENT' | 'VENDOR' | 'EVENT_PLANNER';

export type AuthStackParams = {
  Onboarding: undefined;
  /** social: a Google / Apple sign-in that needs a role to create the account */
  RoleSelect: { social?: { provider: 'google' | 'apple'; id_token: string; name?: string } } | undefined;
  SignIn: undefined;
  SignUp: { role: SignupRole };
  /** password is only passed in memory so the user is signed in right after verifying. */
  VerifyEmail: { email: string; password?: string };
  ForgotPassword: { email?: string } | undefined;
  ResetPassword: { email: string };
};

// ─── Screen props ─────────────────────────────────────────────────────────────

export type EPHomeProps = NativeStackScreenProps<EventPlannerStackParams, 'EPHome'>;
export type MyEventsProps = NativeStackScreenProps<EventPlannerStackParams, 'MyEvents'>;
export type CreateEventProps = NativeStackScreenProps<EventPlannerStackParams, 'CreateEvent'>;
export type EventDetailProps = NativeStackScreenProps<EventPlannerStackParams, 'EventDetail'>;

export type CustomerHomeProps = NativeStackScreenProps<CustomerHomeStackParams, 'CustomerHome'>;
export type CustomerBookingsProps = NativeStackScreenProps<CustomerBookingsStackParams, 'CustomerBookings'>;
export type BookingDetailProps = NativeStackScreenProps<CustomerBookingsStackParams, 'BookingDetail'>;
export type PaymentProps = NativeStackScreenProps<CustomerBookingsStackParams, 'Payment'>;

export type VendorDashboardProps = NativeStackScreenProps<VendorDashboardStackParams, 'VendorDashboard'>;
export type VendorListingsProps = NativeStackScreenProps<VendorListingsStackParams, 'VendorListings'>;
export type VendorBookingsProps = NativeStackScreenProps<VendorBookingsStackParams, 'VendorBookings'>;

export type ChatListProps = NativeStackScreenProps<CustomerMessagesStackParams, 'ChatList'>;
export type ChatDetailProps = NativeStackScreenProps<CustomerMessagesStackParams, 'ChatDetail'>;
