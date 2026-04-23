"use client";

import { useState } from "react";
import { X, Calendar, MessageSquare, Loader2 } from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

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

export default function BookingModal({ listing, onClose }: Props) {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
        toast.success("Booking request sent! The vendor will confirm shortly.");
        onClose();
        router.push("/bookings");
      } else {
        toast.error(res.data?.message || "Something went wrong");
      }
    } catch {
      toast.error("Failed to send booking request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Book Service</h2>
            <p className="text-sm text-gray-500 mt-0.5">{listing.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-5 p-4 bg-primary/5 rounded-xl">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Service price</span>
            <span className="font-bold text-gray-900 dark:text-white">
              ${Number(listing.price).toFixed(2)} / {listing.price_unit}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              Send Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
