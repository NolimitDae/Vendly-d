import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ─── Event Planner ───────────────────────────────────────────────────────────

/** The fields the create/edit event form works with. */
export type EditableEvent = Pick<import('../services/events.service').Event, 'id' | 'name' | 'type' | 'date' | 'venue' | 'guest_count' | 'total_budget' | 'notes'>;

export type EventPlannerStackParams = {
  EPHome: undefined;
  MyEvents: undefined;
  /** With `event`, the same form edits that event's details. */
  CreateEvent: { event?: EditableEvent } | undefined;
  EventDetail: { eventId: string; eventName: string };
  PlannerProfile: undefined;
  /** "Rate your vendors": every completed booking on the event, rated or not */
  RateVendors: { eventId: string; eventName?: string };
  /** create (optionally starting with some vendors) or edit a saved vendor team */
  TeamEditor: { team?: import('../services/eventTools.service').VendorTeam; initialVendors?: import('../services/eventTools.service').TeamVendor[] } | undefined;
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
  /** hours ahead the package must be booked: earlier days are greyed out */
  minNoticeHours?: number | null;
  /** false for venues and packages at the vendor's place (no service address); venues need a guest count */
  needsServiceAddress?: boolean;
  needsGuestCount?: boolean;
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
  /** Add-ons picked when booking; sent as-is to both the contract preview and the booking request. */
  addOns?: { add_on_id: string; quantity?: number }[];
  /** What was picked for the package's customizations; sent as-is to the preview and the request. */
  options?: { group_id: string; option_ids: string[] }[];
};

export type CustomerHomeStackParams = {
  CustomerHome: undefined;
  Notifications: undefined;
  FindVendors: { eventId?: string } | undefined;
  /** "Plan your event": suggested services, budget split and vendors available */
  PlanEvent: undefined;
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
  SwitchRole: undefined;
  VerifyIdentity: undefined;
  Notifications: undefined;
  PaymentMethods: undefined;
  /** charges and refunds (GET /payments/transactions) */
  Transactions: { role?: 'customer' | 'vendor' } | undefined;
  SharedEvents: undefined;
  EventShared: { eventId: string; section?: 'schedule' | 'vendors' | 'files' | 'contracts' };
  PlannerPublic: { userId: string };
  Faq: undefined;
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
  /** The vendor's add-on and fee library; opens on the given tab. */
  AddOns: { tab?: 'ADD_ON' | 'FEE' } | undefined;
};

/** Kept for the listing form's route typing; the screens now live in the dashboard stack. */
export type VendorListingsStackParams = VendorDashboardStackParams;

export type VendorBookingsStackParams = {
  VendorBookings: undefined;
  VendorBookingDetail: { bookingId: string };
  EventShared: { eventId: string; section?: 'schedule' | 'vendors' | 'files' | 'contracts' };
  PlannerPublic: { userId: string };
};

export type VendorProfileStackParams = {
  VendorProfile: undefined;
  VendorContracts: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  SwitchRole: undefined;
  VerifyIdentity: undefined;
  Notifications: undefined;
  Payouts: undefined;
  /** payments received, payouts, commission and refunds */
  Transactions: { role?: 'customer' | 'vendor' } | undefined;
  License: undefined;
  CalendarSync: undefined;
  /** weekly hours customers can book in */
  WorkingHours: undefined;
  Inbox: undefined;
  /** the vendor's reviews, with replies */
  VendorReviews: undefined;
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
