/**
 * Where a notification opens, for a push tap and for a row in the inbox. `id` is the booking,
 * conversation or event it is about (the inbox keeps it as `entity_id`). Returns the tab and the
 * screen inside it, or null when there is nothing to open.
 *
 * Every role has BookingsTab, MessagesTab (ChatList, ChatDetail) and ProfileTab (VerifyIdentity,
 * SwitchRole). Bookings: vendors use VendorBookingDetail, customers and planners BookingDetail.
 * Events: planners own them (HomeTab → EventDetail); vendors see shared ones under BookingsTab and
 * customers under ProfileTab (EventShared).
 */
export interface NotificationTarget {
  tab: 'BookingsTab' | 'MessagesTab' | 'ProfileTab' | 'HomeTab';
  screen: string;
  params?: Record<string, unknown>;
}

export function notificationTarget(
  n: { type?: unknown; id?: unknown; status?: unknown },
  userType?: string,
): NotificationTarget | null {
  const id = typeof n.id === 'string' && n.id ? n.id : null;
  const vendor = userType === 'VENDOR';
  const planner = userType === 'EVENT_PLANNER';
  switch (n.type) {
    // contract notifications (signed, executed, amendments, reminders) open the booking too
    case 'booking':
    case 'contract':
      return id ? { tab: 'BookingsTab', screen: vendor ? 'VendorBookingDetail' : 'BookingDetail', params: { bookingId: id } } : null;
    case 'chat':
    case 'message':
      return id
        ? { tab: 'MessagesTab', screen: 'ChatDetail', params: { conversationId: id, participantName: 'Conversation' } }
        : { tab: 'MessagesTab', screen: 'ChatList' };
    case 'event':
    case 'cosign': {
      if (!id) return null;
      // a co-sign request opens the event's Contracts tab
      const section = n.type === 'cosign' ? { section: 'contracts' } : {};
      if (planner) return { tab: 'HomeTab', screen: 'EventDetail', params: { eventId: id, eventName: '' } };
      return { tab: vendor ? 'BookingsTab' : 'ProfileTab', screen: 'EventShared', params: { eventId: id, ...section } };
    }
    case 'identity':
      // ID check reviewed: approved opens role switching, rejected opens the upload again
      return { tab: 'ProfileTab', screen: n.status === 'REJECTED' ? 'VerifyIdentity' : 'SwitchRole' };
    default:
      return null;
  }
}
