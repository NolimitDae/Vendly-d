"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { CheckCircle2, Loader2, MapPinned, Play } from "lucide-react";
import { toast } from "react-toastify";
import { BookingService } from "@/service/booking/booking.service";
import { errorMessage } from "@/service/rentals/rentals.service";
import { nextVendorStep, type TrackerFields } from "@/lib/booking-tracker";

const hm = (iso: string) => dayjs(iso).format("h:mm A");

/**
 * The vendor's buttons for the day: On my way → Arrived (at the customer's place) or Customer arrived
 * (at the vendor's), then Start booking and Mark as completed. The day-of steps only show the customer
 * where things are; Start and Complete are what move the booking (and its money) on.
 */
export default function VendorDayPanel({
  booking,
  customerName,
  onChanged,
}: {
  booking: TrackerFields & { id: string };
  customerName: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!["CONFIRMED", "IN_PROGRESS"].includes(booking.status) || booking.is_rental) return null;

  const next = nextVendorStep(booking);
  const first = customerName.split(" ")[0] || "The customer";
  const note = booking.checked_in_at
    ? `${first} arrived at ${hm(booking.checked_in_at)}.`
    : booking.arrived_at
      ? `You arrived at ${hm(booking.arrived_at)}.`
      : booking.en_route_at
        ? `On your way since ${hm(booking.en_route_at)}. ${first} can see it.`
        : null;

  const act = async (key: string, call: () => Promise<{ data?: { success?: boolean; message?: string } }>, done: string) => {
    setBusy(key);
    try {
      const res = await call();
      if (res.data?.success === false) throw new Error(res.data.message);
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "That didn’t work. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60";
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3" aria-labelledby="vendor-day">
      <h2 id="vendor-day" className="font-semibold text-gray-900 dark:text-white">
        On the day
      </h2>
      {note && <p className="text-sm text-gray-600 dark:text-gray-300">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {next && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act(next.path, () => BookingService.trackerStep(booking.id, next.path), `${first} can see it on their booking.`)}
            className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {busy === next.path ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPinned className="w-4 h-4" />}
            {next.label}
          </button>
        )}
        {booking.status === "CONFIRMED" && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act("start", () => BookingService.startWork(booking.id), "Booking started")}
            className={`${btn} ${next ? "border border-primary/40 text-primary hover:bg-primary/5" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Start booking
          </button>
        )}
        {booking.status === "IN_PROGRESS" && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act("complete", () => BookingService.complete(booking.id), "Marked as completed")}
            className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {busy === "complete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Mark as completed
          </button>
        )}
      </div>
      {booking.status === "CONFIRMED" && !booking.steps_open && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {booking.service_at === "VENDOR_LOCATION" ? "Customer arrived" : "On my way and Arrived"} show up here the day before the booking.
        </p>
      )}
    </section>
  );
}
