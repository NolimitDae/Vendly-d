"use client";

import { useState } from "react";
import { X, Calendar, MessageSquare, Loader2, CheckCircle, MapPin, Users, Clock } from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import {
  ContractsService,
  SignaturePayload,
  apiError,
  browserTimezone,
} from "@/service/contracts/contracts.service";
import SignContractPanel from "@/components/contracts/SignContractPanel";
import { toast } from "react-toastify";

interface Props {
  listing: {
    id: string;
    title: string;
    price: number;
    price_unit: string;
    vendor?: { id: string; name: string };
  };
  /** Planner bookings: attach to this event (pre-fills venue and guest count). */
  eventId?: string;
  onClose: () => void;
  onBookingCreated?: (bookingId: string) => void;
}

type Step = "details" | "contract" | "sent";

interface Preview {
  title: string;
  body: string;
  content_sha256: string;
  preview_token: string;
  source_pdf_url: string | null;
  consent_text: string;
  missing_message: string | null;
  pricing: { price: string; service_fee: string; total: string };
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";

/** Combines a date (YYYY-MM-DD) and time (HH:mm) in the browser's time zone into an ISO string. */
function toIso(date: string, time?: string) {
  if (!date) return undefined;
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}

export default function BookingModal({ listing, eventId, onClose, onBookingCreated }: Props) {
  const [step, setStep] = useState<Step>("details");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venue, setVenue] = useState("");
  const [guests, setGuests] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);

  const fields = () => {
    const end = endTime ? toIso(date, endTime) : undefined;
    // an end time earlier than the start means the event runs past midnight
    const endFixed =
      end && startTime && endTime < startTime ? new Date(new Date(end).getTime() + 86400e3).toISOString() : end;
    return {
      listing_id: listing.id,
      vendor_id: listing.vendor!.id,
      scheduled_at: toIso(date, startTime),
      event_start_at: startTime ? toIso(date, startTime) : undefined,
      event_end_at: endFixed,
      venue_address: venue.trim() || undefined,
      guest_count: guests ? Number(guests) : undefined,
      message: message.trim() || undefined,
      event_id: eventId,
      timezone: browserTimezone(),
    };
  };

  const loadContract = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!listing.vendor) return;
    if (!date) return toast.error("Choose the event date");
    setLoading(true);
    try {
      const res = await ContractsService.bookingPreview(fields());
      const data: Preview = res.data.data;
      if (data.missing_message) {
        toast.error(data.missing_message);
        return;
      }
      setPreview(data);
      setStep("contract");
    } catch (err) {
      toast.error(apiError(err, "Couldn't load the contract"));
    } finally {
      setLoading(false);
    }
  };

  const signAndSend = async (signature: SignaturePayload) => {
    if (!preview) return;
    setLoading(true);
    try {
      const res = await BookingService.create({ ...fields(), preview_token: preview.preview_token, signature });
      const id: string = res.data.data.id;
      setBookingId(id);
      onBookingCreated?.(id);
      setStep("sent");
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.info("The contract was updated. Please review it again.");
        await loadContract();
      } else {
        toast.error(apiError(err, "Failed to send the booking request"));
      }
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Step, string> = {
    details: "Book Service",
    contract: "Review & Sign Contract",
    sent: "Request Sent",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${
          step === "contract" ? "max-w-2xl" : "max-w-md"
        } max-h-[92vh] overflow-y-auto p-6 z-10`}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{titles[step]}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{listing.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "details" && (
          <div className="mb-5 p-4 bg-primary/5 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">Service price</span>
              <span className="font-bold text-gray-900 dark:text-white">
                ${Number(listing.price).toFixed(2)} / {listing.price_unit}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">A Vendly service fee is added. You&apos;ll see the total in the contract.</p>
          </div>
        )}
        {step === "contract" && preview?.pricing && (
          <div className="mb-4 p-4 bg-primary/5 rounded-xl text-sm space-y-1">
            <div className="flex justify-between"><span>Vendor price</span><span>{preview.pricing.price}</span></div>
            <div className="flex justify-between"><span>Vendly service fee</span><span>{preview.pricing.service_fee}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{preview.pricing.total}</span></div>
            <p className="text-xs text-gray-500 pt-1">You pay after the vendor accepts and signs.</p>
          </div>
        )}

        {step === "details" && (
          <form onSubmit={loadContract} className="space-y-4">
            <div>
              <label htmlFor="event-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1" />
                Event date
              </label>
              <input
                id="event-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Start time
                </label>
                <input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="end-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  End time
                </label>
                <input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="venue" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <MapPin className="w-4 h-4 inline mr-1" />
                Venue address{eventId ? " (defaults to your event's venue)" : ""}
              </label>
              <input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={500} className={inputCls} />
            </div>
            <div>
              <label htmlFor="guests" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Users className="w-4 h-4 inline mr-1" />
                Guest count
              </label>
              <input id="guests" type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="comments" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Booking comments (allergies, special requests)
              </label>
              <textarea
                id="comments"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="These are included in the contract."
                className={`${inputCls} resize-none`}
              />
            </div>
            <p className="text-xs text-gray-500">
              Next you&apos;ll review and sign the vendor&apos;s contract. You pay only after the vendor accepts and signs.
            </p>

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
                Review contract
              </button>
            </div>
          </form>
        )}

        {step === "contract" && preview && (
          <SignContractPanel
            title={preview.title}
            body={preview.body}
            contentSha256={preview.content_sha256}
            consentText={preview.consent_text}
            sourcePdfUrl={preview.source_pdf_url}
            submitLabel="Sign & send request"
            busy={loading}
            onSubmit={signAndSend}
            onCancel={() => setStep("details")}
          />
        )}

        {step === "sent" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-400 text-sm">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>Contract signed and request sent. The vendor will review it and Accept &amp; Sign.</span>
            </div>
            <p className="text-sm text-gray-500">
              Once the vendor signs, you&apos;ll get a notification and can pay securely from your bookings page.
            </p>
            <div className="flex gap-3 pt-2">
              {bookingId && (
                <a
                  href={`/bookings/${bookingId}`}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-center font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  View contract
                </a>
              )}
              <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
