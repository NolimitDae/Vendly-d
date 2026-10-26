import { Linking, Platform } from 'react-native';
import type { Booking } from '../services/booking.service';

export interface TrackerStep {
  key: string;
  label: string;
  /** when it happened, if recorded */
  at: string | null;
  done: boolean;
}

/**
 * The customer's progress tracker, like a pizza tracker: Confirmed → On the way → Arrived → In progress → Done
 * (at the vendor's place: Confirmed → Checked in → In progress → Done). A step counts as done once it has
 * a time, or once a later step (or the booking's status) is past it, even if the vendor skipped it.
 */
export function trackerSteps(b: Booking): TrackerStep[] {
  const raw: { key: string; label: string; at: string | null | undefined }[] =
    b.service_at === 'VENDOR_LOCATION'
      ? [
          { key: 'confirmed', label: 'Confirmed', at: b.confirmed_at },
          { key: 'checked_in', label: 'Checked in', at: b.checked_in_at },
          { key: 'started', label: 'In progress', at: b.started_at },
          { key: 'done', label: 'Done', at: b.completed_at },
        ]
      : [
          { key: 'confirmed', label: 'Confirmed', at: b.confirmed_at },
          { key: 'en_route', label: 'On the way', at: b.en_route_at },
          { key: 'arrived', label: 'Arrived', at: b.arrived_at },
          { key: 'started', label: 'In progress', at: b.started_at },
          { key: 'done', label: 'Done', at: b.completed_at },
        ];
  // the status is the authority: an accepted booking is at least confirmed, a started one at least in progress
  const floor = b.status === 'COMPLETED' ? raw.length - 1 : b.status === 'IN_PROGRESS' ? raw.length - 2 : 0;
  let last = -1;
  raw.forEach((s, i) => {
    if (s.at || i <= floor) last = i;
  });
  return raw.map((s, i) => ({ key: s.key, label: s.label, at: s.at ?? null, done: i <= last }));
}

/** The tracker shows once a booking is accepted, and stays after it's done. */
export const showsTracker = (b: Booking) => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status) && !b.is_rental;

/** A tel: link for a phone number as typed (keeps the + and the digits). */
export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export function callNumber(phone: string) {
  return Linking.openURL(telLink(phone)).catch(() => {});
}

/**
 * Directions in the phone's maps app: Apple Maps on iOS, Google Maps on Android. Uses the map position
 * when known, else the address text.
 */
export function openDirections(place: { lat?: number | null; lng?: number | null; address?: string | null }) {
  const dest = place.lat != null && place.lng != null ? `${place.lat},${place.lng}` : (place.address ?? '').trim();
  if (!dest) return;
  const q = encodeURIComponent(dest);
  const url = Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${q}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {}));
}
