"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Camera,
  Package,
  Link2,
  Upload,
  Clock,
} from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import { vendorAnswersWithin } from "@/lib/requests";
import { toast } from "react-toastify";
import PaymentTimeline from "@/components/payments/PaymentTimeline";
import BookingContractSection from "@/components/contracts/BookingContractSection";
import RentalReturnPanel, { type RentalBookingFields } from "@/components/rentals/RentalReturnPanel";
import BookingExtrasSection from "@/components/addons/BookingExtrasSection";
import CancelBookingDialog from "@/components/bookings/CancelBookingDialog";
import RefundCard from "@/components/bookings/RefundCard";
import InvoiceButton, { invoiceAvailable } from "@/components/bookings/InvoiceButton";
import { InspirationPhotos } from "@/components/bookings/InspirationPhotos";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";
import { bookingStatusColor, bookingStatusLabel, cancellationLine, dueByText, paymentStateText } from "@/lib/booking-status";
import SimilarVendors, { type SimilarVendorsData } from "@/components/bookings/SimilarVendors";
import BookingContact from "@/components/bookings/BookingContact";
import BookingProgress from "@/components/bookings/BookingProgress";
import MapPicture from "@/components/bookings/MapPicture";
import { showsTracker, type TrackerFields } from "@/lib/booking-tracker";
import { useBookingRefresh } from "@/hooks/useBookingRefresh";

interface Proof {
  id: string;
  photos: string[];
  notes?: string;
  created_at: string;
  uploader: { id: string; name: string; avatar_url?: string };
}

interface Deliverable {
  id: string;
  title: string;
  message?: string;
  files: string[];
  links: string[];
  created_at: string;
}

interface Booking extends TrackerFields {
  /** an open request closes on its own at this time */
  request_expires_at?: string | null;
  id: string;
  status: string;
  amount?: number;
  service_fee?: number | string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  payment_plan?: string | null;
  scheduled_at?: string;
  message?: string;
  /** reference photos sent with the request (short-lived signed links) */
  request_photo_urls?: string[];
  created_at: string;
  listing?: { id: string; title: string; images: string[]; location?: string | null };
  vendor?: { id: string; name: string; avatar_url?: string };
  is_rental?: boolean;
  security_deposit?: number | string | null;
  rental_reservations?: RentalBookingFields["rental_reservations"];
  rental_return?: RentalBookingFields["rental_return"];
  expired_at?: string | null;
  /** a missed deposit or balance waiting to be paid by payment_due_by */
  payment_state?: "pending_deposit" | "pending_balance" | null;
  payment_due_by?: string | null;
  cancelled_by?: string | null;
  cancel_reason_label?: string | null;
  cancel_reason?: string | null;
  /** the vendor cancelled: other vendors free on the date */
  similar_vendors?: SimilarVendorsData | null;
}

export default function CustomerBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  // bumped when an add-on or fee is paid, so the payments list reloads
  const [paymentsKey, setPaymentsKey] = useState(0);

  const [cancelling, setCancelling] = useState(false);
  // open the report form (from the cancel dialog's no-show hint, here or on the bookings list)
  const [reporting, setReporting] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("report") === "1") setReporting(true);
  }, []);
  // ?pay=1 (from the "payment needed" email and push): straight to the payments
  useEffect(() => {
    if (!loading && new URLSearchParams(window.location.search).get("pay") === "1") {
      setTimeout(() => document.getElementById("booking-payments")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [loading]);
  const reportProblem = () => {
    setCancelling(false);
    setReporting(true);
    setPaymentsKey((k) => k + 1);
    setTimeout(() => document.getElementById("booking-payments")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };
  const reloadBooking = () =>
    BookingService.getOne(id)
      .then((res) => res.data?.success && setBooking(res.data.data))
      .catch(() => null);
  // the vendor's steps (on the way, arrived, started) show up without a reload
  useBookingRefresh(id, reloadBooking);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      BookingService.getOne(id),
      BookingService.getProofs(id).catch(() => null),
      BookingService.getDeliverables(id).catch(() => null),
    ])
      .then(([bookingRes, proofsRes, delivRes]) => {
        if (bookingRes.data?.success) setBooking(bookingRes.data.data);
        else { toast.error("Booking not found"); router.push("/bookings"); }
        if (proofsRes?.data?.success) setProofs(proofsRes.data.data ?? []);
        if (delivRes?.data?.success) setDeliverables(delivRes.data.data ?? []);
      })
      .catch(() => { toast.error("Failed to load booking"); router.push("/bookings"); })
      .finally(() => setLoading(false));
  }, [id]);

  const [paying, setPaying] = useState(false);
  const payNow = async () => {
    setPaying(true);
    try {
      const res = await BookingService.createCheckout(id);
      if (res.data?.data?.checkout_url) window.location.href = res.data.data.checkout_url;
      else setPaying(false);
    } catch {
      toast.error("Couldn't open payment");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link
        href="/bookings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white dark:text-gray-400"
      >
        <ArrowLeft className="w-4 h-4" /> Back to bookings
      </Link>

      {/* Booking summary */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {booking.listing?.title ?? "Booking"}
            </p>
            <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">by {booking.vendor?.name}</p>
          </div>
          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", bookingStatusColor(booking))}>
            {bookingStatusLabel(booking)}
          </span>
        </div>
        {booking.payment_state && booking.payment_due_by && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 space-y-1" data-testid="payment-due">
            <p className="font-semibold">{paymentStateText(booking.payment_state)}</p>
            <p>
              Your payment didn’t go through. Pay by {dueByText(booking.payment_due_by)} with your card or another card, or the booking is cancelled
              {booking.payment_state === "pending_balance" ? " and your deposit isn’t refunded" : ""}.
            </p>
            <button
              type="button"
              onClick={() => document.getElementById("booking-payments")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="font-semibold underline"
            >
              Pay now
            </button>
          </div>
        )}
        {booking.status === "CANCELLED" && cancellationLine(booking, "CUSTOMER") && (
          <p className="text-sm text-gray-600 dark:text-gray-300" data-testid="cancel-reason">
            {cancellationLine(booking, "CUSTOMER")}
          </p>
        )}
        {booking.status === "PENDING" && vendorAnswersWithin(booking.request_expires_at) && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4 flex-shrink-0" aria-hidden />
            {vendorAnswersWithin(booking.request_expires_at)}. If they don’t, the request closes and nothing is charged.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {booking.scheduled_at && (
            <div>
              <p className="text-gray-400 text-xs">Scheduled</p>
              <p className="font-medium text-gray-800 dark:text-gray-200">
                {dayjs(booking.scheduled_at).format("MMM D, YYYY")}
              </p>
            </div>
          )}
          {booking.amount && (
            <div>
              <p className="text-gray-400 text-xs">Total</p>
              <p className="font-medium text-gray-800 dark:text-gray-200">
                ${(Number(booking.amount) + Number(booking.service_fee ?? 0)).toFixed(2)}
              </p>
              {Number(booking.service_fee ?? 0) > 0 && (
                <p className="text-xs text-gray-400">
                  ${Number(booking.amount).toFixed(2)} + ${Number(booking.service_fee).toFixed(2)} Vendly Protection fee
                </p>
              )}
            </div>
          )}
          {booking.message && (
            <div className="col-span-2">
              <p className="text-gray-400 text-xs">Your note</p>
              <p className="text-gray-700 dark:text-gray-300">{booking.message}</p>
            </div>
          )}
          {!!booking.request_photo_urls?.length && (
            <div className="col-span-2">
              <InspirationPhotos urls={booking.request_photo_urls} title="Your inspiration photos" />
            </div>
          )}
        </div>
        {(["PENDING", "CONFIRMED"].includes(booking.status) || invoiceAvailable(booking)) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {invoiceAvailable(booking) && <InvoiceButton bookingId={booking.id} />}
            {["PENDING", "CONFIRMED"].includes(booking.status) && (
              <button
                type="button"
                onClick={() => setCancelling(true)}
                className="px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
              >
                {booking.status === "PENDING" ? "Cancel request" : "Cancel booking"}
              </button>
            )}
          </div>
        )}
      </div>

      {booking.vendor && <BookingContact person={booking.vendor} role="Vendor" phone={booking.contact_phone} />}

      {showsTracker(booking) && <BookingProgress booking={booking} />}

      {booking.service_at === "VENDOR_LOCATION" && !booking.is_rental && (!!booking.vendor_place || ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(booking.status)) && (
        <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3" aria-labelledby="where-to-go">
          <h2 id="where-to-go" className="font-semibold text-gray-900 dark:text-white">
            Where to go
          </h2>
          {booking.vendor_place ? (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300">{booking.vendor_place.address}</p>
              <MapPicture lat={booking.vendor_place.lat} lng={booking.vendor_place.lng} address={booking.vendor_place.address} directions label={`Map of ${booking.vendor?.name ?? "the vendor"}'s address`} />
            </>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {booking.listing?.location ? `${booking.listing.location}. ` : ""}
              {booking.status === "PENDING"
                ? `You go to ${booking.vendor?.name ?? "the vendor"} for this booking. You'll see their address once they accept.`
                : `You go to ${booking.vendor?.name ?? "the vendor"} for this booking. They haven't added their address yet, so message them for it.`}
            </p>
          )}
        </section>
      )}

      {booking.service_at !== "VENDOR_LOCATION" && !!booking.venue_address && (
        <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3" aria-labelledby="booking-location">
          <h2 id="booking-location" className="font-semibold text-gray-900 dark:text-white">
            Location
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">{booking.venue_address}</p>
          <MapPicture lat={booking.venue_lat} lng={booking.venue_lng} address={booking.venue_address} height={160} />
        </section>
      )}

      {booking.status === "CANCELLED" && <RefundCard bookingId={booking.id} role="CUSTOMER" cancelledAt={booking.cancelled_at} />}
      {booking.status === "CANCELLED" && booking.similar_vendors && <SimilarVendors data={booking.similar_vendors} />}

      {cancelling && (
        <CancelBookingDialog
          bookingId={booking.id}
          role="CUSTOMER"
          onReportProblem={reportProblem}
          onClose={() => setCancelling(false)}
          onCancelled={() => {
            reloadBooking();
            setPaymentsKey((k) => k + 1);
          }}
        />
      )}

      <RentalReturnPanel booking={booking} role="CUSTOMER" />

      <BookingExtrasSection bookingId={booking.id} role="CUSTOMER" bookingStatus={booking.status} onChanged={() => setPaymentsKey((k) => k + 1)} />

      <PaymentTimeline key={paymentsKey} bookingId={booking.id} bookingStatus={booking.status} startReporting={reporting} />

      {!booking.payment_plan && ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
          {booking.paid_at ? (
            <p className="text-sm text-green-700">Paid on {dayjs(booking.paid_at).format("MMM D, YYYY")}</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">The vendor signed. Pay to secure your booking.</p>
              <button
                onClick={payNow}
                disabled={paying}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
              >
                {paying ? "Opening…" : "Pay now"}
              </button>
            </>
          )}
        </div>
      )}

      <BookingContractSection bookingId={booking.id} role="CUSTOMER" bookingStatus={booking.status} />

      {/* Photo Proof */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Photo Proof</h2>
        </div>

        {proofs.length === 0 ? (
          <p className="text-sm text-gray-400">No proof uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {proofs.map((proof) => (
              <div key={proof.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <p className="text-xs text-gray-400">{dayjs(proof.created_at).format("MMM D, YYYY h:mm A")}</p>
                {proof.notes && <p className="text-sm text-gray-600 dark:text-gray-300">{proof.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {proof.photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={url}
                        alt={`Proof ${i + 1}`}
                        width={80}
                        height={80}
                        className="w-20 h-20 object-cover rounded-lg border"
                        unoptimized
                      />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Deliverables */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Deliverables</h2>
        </div>

        {deliverables.length === 0 ? (
          <p className="text-sm text-gray-400">No deliverables sent yet.</p>
        ) : (
          <div className="space-y-3">
            {deliverables.map((d) => (
              <div key={d.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <p className="font-medium text-gray-900 dark:text-white">{d.title}</p>
                <p className="text-xs text-gray-400">{dayjs(d.created_at).format("MMM D, YYYY h:mm A")}</p>
                {d.message && <p className="text-sm text-gray-600 dark:text-gray-300">{d.message}</p>}
                {d.files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {d.files.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline flex items-center gap-1"
                      >
                        <Upload className="w-3 h-3" /> File {i + 1}
                      </a>
                    ))}
                  </div>
                )}
                {d.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {d.links.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 underline flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" /> {link}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
