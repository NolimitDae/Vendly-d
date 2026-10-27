"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { CalendarDays, ChevronRight } from "lucide-react";
import VendorDayPanel from "@/components/bookings/VendorDayPanel";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/booking-status";
import type { UpcomingBooking } from "@/service/vendor/vendor-dashboard.service";

/** "Sat, Nov 14 · 4:00 PM – 8:00 PM", or the date only for rentals and date-only bookings. */
export function whenText(b: Pick<UpcomingBooking, "event_start_at" | "event_end_at" | "scheduled_at" | "is_rental">): string {
  const start = b.event_start_at ?? b.scheduled_at;
  if (!start) return "Date to be agreed";
  const s = dayjs(start);
  if (b.is_rental) return s.format("ddd, MMM D");
  const end = b.event_end_at ? dayjs(b.event_end_at) : null;
  const time = end && end.isSame(s, "day") ? `${s.format("h:mm A")} – ${end.format("h:mm A")}` : s.format("h:mm A");
  return `${s.format("ddd, MMM D")} · ${time}`;
}

/** The next few bookings, with the "On the day" buttons once they open. */
export default function UpcomingBookings({ bookings, loading = false, onChanged }: { bookings: UpcomingBooking[]; loading?: boolean; onChanged: () => void }) {
  return (
    <section aria-labelledby="upcoming-heading" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 id="upcoming-heading" className="text-lg font-semibold text-gray-900 dark:text-white">
          Upcoming bookings
        </h2>
        <Link href="/vendor/bookings" className="text-sm font-medium text-primary dark:text-orchid-300 hover:underline">
          See all
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-700/60 animate-pulse" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center text-center py-8 gap-2">
          <CalendarDays className="w-10 h-10 text-gray-300 dark:text-gray-600" aria-hidden />
          <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming bookings yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{b.title ?? "Booking"}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {b.customer?.name ?? "Customer"} · {whenText(b)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {b.amount != null && <span className="font-semibold text-gray-900 dark:text-white">${b.amount.toFixed(2)}</span>}
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${bookingStatusColor(b)}`}>{bookingStatusLabel(b)}</span>
                </div>
              </div>
              {/* the day-of buttons only once they're open; before that the booking page has everything */}
              {b.steps_open && <VendorDayPanel booking={b} customerName={b.customer?.name ?? "The customer"} onChanged={onChanged} />}
              <Link
                href={`/vendor/bookings/${b.id}`}
                aria-label={`View booking: ${b.title ?? "Booking"} with ${b.customer?.name ?? "the customer"}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-orchid-300 hover:underline"
              >
                View booking <ChevronRight className="w-4 h-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
