"use client";

import { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { X, Calendar, MessageSquare, Loader2, CheckCircle, MapPin, Users, Clock, Minus, Plus } from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import {
  ContractsService,
  SignaturePayload,
  apiError,
  browserTimezone,
} from "@/service/contracts/contracts.service";
import SignContractPanel from "@/components/contracts/SignContractPanel";
import SavedCards from "@/components/payments/SavedCards";
import { PLAN_LABELS, type PaymentPlan, type ScheduleLine } from "@/service/payments/payments.service";
import { toast } from "react-toastify";
import type { AddOn } from "@/service/add-ons/add-ons.service";
import { packagePriceText, perUnit, quantityRangeText } from "@/lib/addons";
import { dayKeyOf, endTimesOn, formatTime, hoursMessage, isOpenDay, otherZone, startTimesOn, summariseHours, withZone, type WorkingHours } from "@/lib/working-hours";

interface Props {
  listing: {
    id: string;
    title: string;
    price: number;
    price_unit: string;
    /** per person / hour / day packages: fewest and most guests, hours or days */
    min_quantity?: number | null;
    max_quantity?: number | null;
    add_ons?: AddOn[];
    fees?: AddOn[];
    vendor?: { id: string; name: string };
    /** the vendor's weekly hours: closed days can't be picked and times stay inside the day's hours */
    working_hours?: WorkingHours | null;
  };
  /** Planner bookings: attach to this event (pre-fills venue and guest count). */
  eventId?: string;
  /** A vendor's quote from chat: the booking is at the quoted price. */
  quote?: { id: string; title: string; amount: number };
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
  pricing: {
    price: number;
    service_fee: number;
    total: number;
    plan?: PaymentPlan;
    schedule?: ScheduleLine[];
    discount?: number;
    promo_code?: string | null;
    quote?: { id: string; title: string; amount: number } | null;
    package?: { label: string; unit: string; quantity: number; unit_price: number; amount: number } | null;
    add_ons?: { add_on_id: string; name: string; label: string; quantity: number; unit_price: number; amount: number }[];
  };
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";

/** Combines a date (YYYY-MM-DD) and time (HH:mm) in the browser's time zone into an ISO string. */
const money = (n: number | string) => "$" + Number(n).toFixed(2);

function toIso(date: string, time?: string) {
  if (!date) return undefined;
  // a vendor open until midnight: 24:00 is 00:00 the next day
  if (time === "24:00") return new Date(new Date(`${date}T00:00`).getTime() + 86400e3).toISOString();
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function BookingModal({ listing, eventId, quote, onClose, onBookingCreated }: Props) {
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
  const [card, setCard] = useState<string | null>(null);
  const [promo, setPromo] = useState("");
  // add-on id -> quantity (1 unless priced "each")
  const [picked, setPicked] = useState<Record<string, number>>({});
  const addOns = listing.add_ons ?? [];
  const fees = listing.fees ?? [];
  // a quote is the agreed price, so the package isn't counted out by guests or hours
  const unit = quote ? null : perUnit(listing.price_unit);
  const minQ = listing.min_quantity && listing.min_quantity > 0 ? listing.min_quantity : null;
  const maxQ = listing.max_quantity && listing.max_quantity > 0 ? listing.max_quantity : null;
  const range = quote ? null : quantityRangeText(listing.price_unit, minQ, maxQ);
  // the vendor's weekly hours (null = any day, any time)
  const hours = listing.working_hours ?? null;
  const summary = summariseHours(hours);
  // "(Chicago time)" when the vendor's hours are in another zone than the customer's
  const hoursText = summary && withZone(summary, hours);
  // hourly packages: the booking has to fit the fewest hours inside the day, and not run past the most
  const minMinutes = unit === "hour" && minQ ? minQ * 60 : 30;
  const startOptions = startTimesOn(hours, date, 30, minMinutes);
  const endOptions = endTimesOn(hours, date, startTime)?.filter((t) => {
    if (unit !== "hour" || !startTime) return true;
    const length = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) - (Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)));
    return length >= minMinutes && (!maxQ || length <= maxQ * 60);
  });
  const [dateError, setDateError] = useState<string | null>(null);

  const pickDate = (value: string) => {
    if (value && hours && !isOpenDay(hours, value)) {
      setDateError(`${hoursMessage(hours, dayKeyOf(value))} Please pick another day.`);
      setDate("");
    } else {
      setDateError(null);
      setDate(value);
    }
    // times are picked again for the new day's hours
    if (hours) {
      setStartTime("");
      setEndTime("");
    }
  };
  const pickStart = (value: string) => {
    setStartTime(value);
    // an end that no longer fits after the new start is cleared
    if (hours && endTime && value && endTime <= value) setEndTime("");
  };

  const togglePick = (a: AddOn) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[a.id]) delete next[a.id];
      else next[a.id] = 1;
      return next;
    });
  const setQty = (a: AddOn, q: number) => {
    const cap = a.max_quantity && a.max_quantity > 0 ? a.max_quantity : 1000;
    setPicked((p) => ({ ...p, [a.id]: Math.max(1, Math.min(cap, q)) }));
  };
  // listing order, so the preview and the request always send the same list
  const pickedList = () =>
    addOns
      .filter((a) => picked[a.id])
      .map((a) => (a.price_unit === "PER_ITEM" ? { add_on_id: a.id, quantity: picked[a.id] } : { add_on_id: a.id }));

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
      payment_method_id: card ?? undefined,
      promo_code: promo.trim() || undefined,
      quote_id: quote?.id,
      add_ons: pickedList().length ? pickedList() : undefined,
    };
  };

  /** What the package and the picked add-ons need before the contract can be priced. */
  const missingForPrice = (): string | null => {
    const g = guests ? Number(guests) : 0;
    const chosen = addOns.filter((a) => picked[a.id]);
    if (unit === "person" || chosen.some((a) => a.price_unit === "PER_PERSON")) {
      if (!(g >= 1)) return unit === "person" ? "Enter how many guests are coming. This package is priced per person." : "Enter how many guests are coming.";
    }
    if (unit === "person" && minQ && g < minQ) return `This package is for at least ${minQ} guests.`;
    if (unit === "person" && maxQ && g > maxQ) return `This package is for up to ${maxQ} guests. Message the vendor about a bigger event.`;
    if (unit === "hour" || chosen.some((a) => a.price_unit === "PER_HOUR")) {
      if (!startTime || !endTime) return unit === "hour" ? "Add a start and end time. This package is priced by the hour." : "Add a start and end time for the add-ons priced by the hour.";
    }
    return null;
  };

  const loadContract = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!listing.vendor) return;
    if (!date) return toast.error("Choose the event date");
    // with working hours, the request has to say when it starts so it can fit the vendor's day
    if (hours && !startTime) return toast.error("Choose a start time within the vendor's hours");
    const missing = missingForPrice();
    if (missing) return toast.error(missing);
    if (!card) return toast.error("Add a card first. It is only charged once the vendor accepts.");
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
            <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">{listing.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "details" && (
          <div className="mb-5 p-4 bg-primary/5 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">{quote ? `Quote: ${quote.title}` : "Service price"}</span>
              <span className="font-bold text-gray-900 dark:text-white">
                {quote ? `$${quote.amount.toFixed(2)}` : unit ? packagePriceText(listing.price, listing.price_unit) : <>${Number(listing.price).toFixed(2)}{listing.price_unit && listing.price_unit !== "fixed" ? ` / ${listing.price_unit}` : ""}</>}
              </span>
            </div>
            {range && <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{range}</p>}
            <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">A Vendly Protection fee is added. You&apos;ll see the total in the contract.</p>
          </div>
        )}
        {step === "contract" && preview?.pricing && (
          <div className="mb-4 p-4 bg-primary/5 rounded-xl text-sm space-y-1">
            {preview.pricing.package && (
              <div className="flex justify-between gap-3 text-gray-700 dark:text-gray-300">
                <span>{preview.pricing.package.unit === "fixed" && !preview.pricing.quote ? "Package" : preview.pricing.package.label}</span>
                <span>{money(preview.pricing.package.amount)}</span>
              </div>
            )}
            {preview.pricing.add_ons?.map((a) => (
              <div key={a.add_on_id} className="flex justify-between gap-3 text-gray-700 dark:text-gray-300">
                <span>{a.label}</span>
                <span>{money(a.amount)}</span>
              </div>
            ))}
            {!!preview.pricing.discount && <div className="flex justify-between text-green-600"><span>Promo {preview.pricing.promo_code}</span><span>-{money(preview.pricing.discount)}</span></div>}
            <div className="flex justify-between"><span>Vendor price</span><span>{money(preview.pricing.price)}</span></div>
            <div className="flex justify-between"><span>Vendly Protection fee</span><span>{money(preview.pricing.service_fee)}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{money(preview.pricing.total)}</span></div>
            {preview.pricing.plan && <p className="text-xs text-primary pt-2">{PLAN_LABELS[preview.pricing.plan]}</p>}
            {preview.pricing.schedule?.map((line, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                <span>{line.label} · {i === 0 && !line.capture_manually ? "when the vendor accepts" : new Date(line.due_at).toLocaleDateString()}</span>
                <span>{money(line.amount)}</span>
              </div>
            ))}
            <p className="text-xs text-gray-500 pt-1 dark:text-gray-400">You pay after the vendor accepts and signs. Vendly holds the money until the service is done.</p>
          </div>
        )}

        {step === "details" && (
          <form onSubmit={loadContract} className="space-y-4">
            <div>
              <label htmlFor="event-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1" />
                Event date
              </label>
              {hours ? (
                <DatePicker
                  id="event-date"
                  selected={date ? new Date(`${date}T12:00:00`) : null}
                  onChange={(d: Date | null) => pickDate(d ? ymd(d) : "")}
                  // the vendor's closed days can't be picked
                  filterDate={(d: Date) => isOpenDay(hours, d)}
                  minDate={new Date()}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="Pick a day the vendor works"
                  required
                  autoComplete="off"
                  ariaDescribedBy="event-date-hours"
                  wrapperClassName="w-full"
                  className={inputCls}
                />
              ) : (
                <input
                  id="event-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className={inputCls}
                />
              )}
              {hoursText && (
                <p id="event-date-hours" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Works {hoursText}
                </p>
              )}
              {dateError && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {dateError}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Start time
                </label>
                {startOptions ? (
                  <select id="start-time" value={startTime} onChange={(e) => pickStart(e.target.value)} className={inputCls}>
                    <option value="">{startOptions.length ? "Choose" : "Pick a date first"}</option>
                    {startOptions.map((t) => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ))}
                  </select>
                ) : (
                  <input id="start-time" type="time" value={startTime} disabled={!!hours && !date} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
                )}
              </div>
              <div>
                <label htmlFor="end-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  End time
                </label>
                {endOptions ? (
                  <select id="end-time" value={endTime} aria-required={unit === "hour"} disabled={!startTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls}>
                    <option value="">{startTime ? "Choose" : "Pick a start first"}</option>
                    {endOptions.map((t) => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="end-time"
                    type="time"
                    value={endTime}
                    aria-required={unit === "hour"}
                    disabled={!!hours && !date}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={inputCls}
                  />
                )}
              </div>
              {hours && date && (otherZone(hours) ? isOpenDay(hours, date) : hours[dayKeyOf(date)]) && (
                <p className="col-span-2 text-xs text-gray-500 dark:text-gray-400 -mt-1">{hoursMessage(hours, dayKeyOf(date))}</p>
              )}
              {unit === "hour" && (
                <p className="col-span-2 text-xs text-gray-500 dark:text-gray-400 -mt-1">
                  Priced by the hour, so add start and end times{range ? ` (${range})` : ""}.
                </p>
              )}
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
                Guest count{unit === "person" ? " (required)" : ""}
              </label>
              <input
                id="guests"
                type="number"
                min={1}
                aria-required={unit === "person"}
                aria-describedby={unit === "person" && range ? "guests-hint" : undefined}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                className={inputCls}
              />
              {unit === "person" && range && <p id="guests-hint" className="text-xs text-gray-500 dark:text-gray-400 mt-1">This package is for {range}.</p>}
            </div>
            {addOns.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Add-ons (optional)</legend>
                {addOns.map((a) => {
                  const on = !!picked[a.id];
                  const cap = a.max_quantity && a.max_quantity > 0 ? a.max_quantity : 1000;
                  return (
                    <div key={a.id} className={`p-3 rounded-xl border ${on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"}`}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => togglePick(a)} className="w-4 h-4 mt-0.5 accent-primary" />
                        <span className="flex-1 min-w-0">
                          <span className="flex justify-between gap-2 text-sm">
                            <span className="font-medium text-gray-900 dark:text-white">{a.name}</span>
                            <span className="text-gray-600 dark:text-gray-300 whitespace-nowrap">{a.price_text}</span>
                          </span>
                          {a.description && <span className="block text-xs text-gray-500 dark:text-gray-400">{a.description}</span>}
                        </span>
                      </label>
                      {on && a.price_unit === "PER_ITEM" && (
                        <div className="flex items-center gap-3 mt-2 ml-7" role="group" aria-label={`How many ${a.name}`}>
                          <button type="button" aria-label={`Fewer ${a.name}`} disabled={picked[a.id] <= 1} onClick={() => setQty(a, picked[a.id] - 1)} className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center disabled:opacity-40">
                            <Minus className="w-4 h-4" />
                          </button>
                          <span aria-live="polite" className="min-w-6 text-center text-sm font-semibold text-gray-900 dark:text-white">{picked[a.id]}</span>
                          <button type="button" aria-label={`More ${a.name}`} disabled={picked[a.id] >= cap} onClick={() => setQty(a, picked[a.id] + 1)} className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center disabled:opacity-40">
                            <Plus className="w-4 h-4" />
                          </button>
                          {a.max_quantity ? <span className="text-xs text-gray-500 dark:text-gray-400">up to {a.max_quantity}</span> : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </fieldset>
            )}
            {fees.length > 0 && (
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-600 dark:text-gray-300">
                <p className="font-medium text-gray-700 dark:text-gray-200">Possible fees after the service</p>
                <p>{fees.map((f) => `${f.name} (${f.price_text})`).join(" · ")}</p>
                <p className="mt-1 text-gray-500 dark:text-gray-400">Only charged if they apply, and only after you approve each one.</p>
              </div>
            )}
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
            <div>
              <label htmlFor="promo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Promo code (optional)</label>
              <input id="promo" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} maxLength={50} className={inputCls} />
            </div>
            <div>
              <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Payment method</p>
              <SavedCards selected={card} onSelect={setCard} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Next you&apos;ll review and sign the vendor&apos;s contract. Your card is charged only after the vendor accepts and signs.
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
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Once the vendor signs, your saved card is charged under the payment plan and you&apos;ll see each payment on the booking page.
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
              <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
