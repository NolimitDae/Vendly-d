"use client";

import { useState } from "react";
import { X, Calendar, MessageSquare, Loader2, CreditCard, CheckCircle } from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import { toast } from "react-toastify";

interface Props {
  listing: {
    id: string;
    title: string;
    price: number;
    price_unit: string;
    vendor?: { id: string; name: string };
  };
  onClose: () => void;
}

type Step = "details" | "pay";

export default function BookingModal({ listing, onClose }: Props) {
  const [step, setStep] = useState<Step>("details");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing.vendor) return;

    setLoading(true);
    try {
      const res = await BookingService.create({
        listing_id: listing.id,
        vendor_id: listing.vendor.id,
        scheduled_at: scheduledAt || undefined,
        message: message || undefined,
      });

      if (res.data?.success) {
        setBookingId(res.data.data.id);
        setStep("pay");
      } else {
        toast.error(res.data?.message || "Something went wrong");
      }
    } catch {
      toast.error("Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const res = await BookingService.createCheckout(bookingId);
      if (res.data?.success && res.data.data?.checkout_url) {
        window.location.href = res.data.data.checkout_url;
      } else {
        toast.error(res.data?.message || "Failed to open payment page");
        setLoading(false);
      }
    } catch {
      toast.error("Failed to initiate payment");
      setLoading(false);
    }
  };

  const handlePayLater = () => {
    toast.success("Booking request sent! Pay later from your bookings page.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {step === "details" ? "Book Service" : "Complete Payment"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{listing.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Price summary */}
        <div className="mb-5 p-4 bg-primary/5 rounded-xl">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Service price</span>
            <span className="font-bold text-gray-900 dark:text-white">
              ${Number(listing.price).toFixed(2)} / {listing.price_unit}
            </span>
          </div>
        </div>

        {step === "details" ? (
          <form onSubmit={handleRequestBooking} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1" />
                Preferred Date & Time (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Message to vendor (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Describe your requirements..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-400 text-sm">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>Booking request created! Complete payment to confirm your spot.</span>
            </div>

            <p className="text-sm text-gray-500">
              Pay securely via Stripe. You&apos;ll be redirected to a secure checkout page and brought back when done.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handlePayLater}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
              >
                Pay Later
              </button>
              <button
                onClick={handlePayNow}
                disabled={loading}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                Pay Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
