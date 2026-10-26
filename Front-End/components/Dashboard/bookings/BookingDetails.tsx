"use client";

import Link from "next/link";
import ModalWrapper from "../common/modal/ModalWrapper";
import DetailGrid from "../common/DetailGrid";
import { cancelledByText, dueByText, paymentStateText } from "@/lib/booking-status";
import type { ChosenCustomization } from "@/lib/package-options";

const money = (v: unknown) => (v === null || v === undefined || v === "" ? null : `$${Number(v).toFixed(2)}`);
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : null);
const words = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : null);
const person = (p?: { name?: string | null; email?: string | null } | null) =>
  p ? [p.name, p.email].filter(Boolean).join(" · ") : null;

/** One booking from the admin list (GET /admin/bookings), as it came from the API. */
export default function BookingDetails({ booking, onClose }: { booking: any; onClose: () => void }) {
  const disputed = !!booking.dispute_opened_at && !booking.dispute_resolved_at;
  return (
    <ModalWrapper isOpen onClose={onClose} size="lg">
      <div role="dialog" aria-modal="true" aria-label="Booking details" className="p-6 space-y-5">
        <div className="pr-10">
          <p className="text-xs text-descriptionColor">Booking #{String(booking.id).slice(-8).toUpperCase()}</p>
          <h2 className="text-lg font-semibold text-blackColor">{booking.listing?.title || "Booking"}</h2>
        </div>
        <DetailGrid
          items={[
            ["Status", words(booking.status)],
            ["Payment", booking.payment_state ? `${paymentStateText(booking.payment_state)}, due by ${dueByText(booking.payment_due_by)}` : null],
            ["Booked on", day(booking.created_at)],
            ["Event date", day(booking.event_start_at ?? booking.scheduled_at)],
            ["Venue", booking.venue_address],
            ["Guests", booking.guest_count],
            ["Customer", person(booking.customer)],
            ["Vendor", person(booking.vendor)],
            ["Amount", money(booking.amount)],
            ["Service fee", money(booking.service_fee)],
            ["Discount", booking.discount ? `${money(booking.discount)}${booking.promo_code ? ` (${booking.promo_code})` : ""}` : null],
            ["Payment plan", words(booking.payment_plan)],
            ["Paid on", day(booking.paid_at)],
            ["Completed on", day(booking.completed_at)],
            ["Cancelled on", day(booking.cancelled_at)],
            ["Cancelled by", booking.status === "CANCELLED" ? cancelledByText(booking.cancelled_by, "ADMIN") : null],
            ["Cancel reason", booking.cancel_reason_label],
            [booking.cancel_reason_label ? "Cancel note" : "Cancel reason", booking.cancel_reason],
            ["Decline reason", booking.reject_reason],
            ["Dispute", booking.dispute_opened_at ? `${disputed ? "Open" : "Resolved"} since ${day(booking.dispute_opened_at)}` : null],
            // the package customizations picked, as they were when booked
            ...((booking.customizations ?? []) as ChosenCustomization[]).map(
              (g): [string, string] => [`Customization: ${g.title}`, `${g.options.map((o) => o.label).join(", ")}${g.amount > 0 ? ` (+${money(g.amount)})` : ""}`],
            ),
          ]}
        />
        {disputed && (
          <Link href="/dashboard/disputes" className="inline-block px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            Go to disputes
          </Link>
        )}
      </div>
    </ModalWrapper>
  );
}
