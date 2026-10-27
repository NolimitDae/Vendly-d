"use client";

import { isLoggedIn as hasSession } from "@/lib/session";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Boxes, CheckCircle2, Loader2, MapPin, Minus, Package, Plus, ShieldCheck, Store, Tag } from "lucide-react";
import { toast } from "react-toastify";
import RangeCalendar from "@/components/rentals/RangeCalendar";
import SavedCards from "@/components/payments/SavedCards";
import { RentalsService, dayKey, errorMessage, money, type RentalItem, type RentalQuote } from "@/service/rentals/rentals.service";
import LocationField from "@/components/listing/LocationField";
import DosDontsList from "@/components/listing/DosDontsList";

const parse = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : null);

export default function RentalItemPage() {
  const { id } = useParams<{ id: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const [item, setItem] = useState<RentalItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [start, setStart] = useState<Date | null>(parse(query.get("from")));
  const [end, setEnd] = useState<Date | null>(parse(query.get("to")));
  // item_id → quantity, starting with this item; other items from the vendor can be added
  const [qty, setQty] = useState<Record<string, number>>({ [id]: 1 });
  const [others, setOthers] = useState<RentalItem[]>([]);
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [venue, setVenue] = useState("");
  // delivered to an address, or picked up from the vendor (as every item in the order allows)
  const [handover, setHandover] = useState<"delivery" | "pickup" | null>(null);
  const [notes, setNotes] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const loggedIn = hasSession();

  useEffect(() => {
    RentalsService.item(id)
      .then((r) => (r.data?.success ? setItem(r.data.data) : setError(r.data?.message ?? "Rental not found")))
      .catch((e) => setError(errorMessage(e, "Rental not found")));
  }, [id]);

  const free = useMemo(() => new Map((item?.calendar ?? []).map((c) => [c.date, c.available])), [item]);
  const freeOn = (d: Date) => free.get(dayKey(d)) ?? item?.quantity ?? 0;
  const startKey = start ? dayKey(start) : "";
  const endKey = start ? dayKey(end ?? start) : "";

  // the rest of the vendor's stock, with availability for the chosen dates
  useEffect(() => {
    if (!item || !startKey) return;
    RentalsService.browse({ vendor_id: item.vendor_id, start_date: startKey, end_date: endKey, limit: 50 })
      .then((r) => r.data?.success && setOthers((r.data.data as RentalItem[]).filter((o) => o.id !== item.id)))
      .catch(() => {});
  }, [item, startKey, endKey]);

  const lines = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([item_id, quantity]) => ({ item_id, quantity })), [qty]);

  const offers = quote?.handover ?? { delivery: item?.offers_delivery ?? true, pickup: item?.offers_pickup ?? true };
  const way = offers.delivery && offers.pickup ? handover : offers.delivery ? "delivery" : offers.pickup ? "pickup" : null;
  // a delivered order is quoted with its address, so the delivery fee shows as it's typed
  const deliverTo = way === "delivery" ? venue.trim() : "";

  useEffect(() => {
    if (!startKey || !lines.length) return setQuote(null);
    const t = setTimeout(() => {
      RentalsService.quote({ lines, start_date: startKey, end_date: endKey, customer_comes: way ? way === "pickup" : undefined, venue_address: deliverTo || undefined })
        .then((r) => r.data?.success && setQuote(r.data.data))
        .catch((e) => toast.error(errorMessage(e)));
    }, deliverTo ? 600 : 250);
    return () => clearTimeout(t);
  }, [lines, startKey, endKey, way, deliverTo]);

  const maxFor = (itemId: string) => {
    const line = quote?.lines.find((l) => l.item_id === itemId);
    if (line) return line.available;
    if (itemId === id) {
      if (!item || !start) return item?.quantity ?? 1;
      let min = item.quantity;
      for (let d = new Date(start); d <= (end ?? start); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) min = Math.min(min, freeOn(d));
      return min;
    }
    return others.find((o) => o.id === itemId)?.available ?? 0;
  };

  const send = async () => {
    if (!loggedIn) return router.push(`/login?redirect=/rentals/${id}`);
    if (!start) return toast.error("Pick your dates first");
    if (!card) return toast.error("Add a card. It is only charged once the vendor accepts.");
    if (quote && !quote.available) return toast.error("Not enough stock for some items. Lower the quantity or change dates.");
    if (!offers.delivery && !offers.pickup) return toast.error("These items can't go in one order: some are delivery only and some pickup only. Rent them separately.");
    if (!way) return toast.error("Choose delivery or pickup");
    if (way === "delivery" && !venue.trim()) return toast.error("Enter the delivery address");
    if (way === "delivery" && quote?.delivery?.status === "UNPRICED") return toast.error(quote.delivery.message ?? "Check the delivery address");
    setSending(true);
    try {
      const pickup = way === "pickup";
      const res = await RentalsService.book({ lines, start_date: startKey, end_date: endKey, customer_comes: pickup, venue_address: pickup ? undefined : venue.trim(), message: notes.trim() || undefined, payment_method_id: card });
      if (res.data?.success === false) throw new Error(res.data?.message);
      setSent(true);
    } catch (e) {
      toast.error(errorMessage(e, "Could not send the request"));
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-500">
        <Package className="w-12 h-12 opacity-40" />
        <p>{error}</p>
        <Link href="/rentals" className="text-primary hover:underline text-sm">Back to rentals</Link>
      </div>
    );
  }
  if (!item) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl p-8 text-center space-y-4 border border-gray-100 dark:border-gray-700">
          <CheckCircle2 className="w-14 h-14 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Request sent!</h1>
          <p className="text-gray-500 dark:text-gray-400">{item.vendor?.name} will confirm the items are ready for your dates. Your card is charged once they accept.</p>
          <div className="flex gap-3 justify-center pt-2">
            <Link href="/bookings" className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm">View my bookings</Link>
            <Link href="/rentals" className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Keep browsing</Link>
          </div>
        </div>
      </div>
    );
  }

  const days = start ? Math.round(((end ?? start).getTime() - start.getTime()) / 86400000) + 1 : 0;
  const pickedOthers = others.filter((o) => o.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/rentals" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white dark:text-gray-400 mb-6">
          <ArrowLeft className="w-4 h-4" /> All rentals
        </Link>

        <div className="grid lg:grid-cols-[1fr_400px] gap-8">
          {/* Left: photos, details, dates */}
          <div className="space-y-6">
            <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800">
              {item.images[photo] ? (
                <Image src={item.images[photo]} alt={item.title} fill className="object-cover" unoptimized />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 dark:text-gray-600"><Package className="w-16 h-16" /></div>
              )}
            </div>
            {item.images.length > 1 && (
              <div className="flex gap-2">
                {item.images.map((src, i) => (
                  <button key={src} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${i === photo ? "border-primary" : "border-transparent"}`}>
                    <Image src={src} alt="" fill className="object-cover" unoptimized />
                  </button>
                ))}
              </div>
            )}

            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{item.title}</h1>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                {item.vendor && (
                  <Link href={`/marketplace/vendors/${item.vendor.id}`} className="flex items-center gap-1.5 text-primary hover:underline">
                    <Store className="w-4 h-4" /> {item.vendor.name}
                  </Link>
                )}
                {item.location && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {item.location}</span>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Fact icon={<Tag className="w-4 h-4" />} label="Per day" value={money(item.daily_rate)} />
              <Fact icon={<ShieldCheck className="w-4 h-4" />} label="Deposit per unit" value={item.deposit_amount > 0 ? money(item.deposit_amount) : "None"} />
              <Fact icon={<Boxes className="w-4 h-4" />} label="In stock" value={String(item.quantity)} />
            </div>

            {item.description && <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{item.description}</p>}
            <DosDontsList dos={item.dos} donts={item.donts} />

            <section className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Pick your dates</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {!start ? "Click the pickup day, then the return day." : !end ? `Pickup ${start.toDateString()}, now click the return day.` : `${start.toDateString()} → ${end.toDateString()} · ${days} day${days > 1 ? "s" : ""}`}
              </p>
              <RangeCalendar
                start={start}
                end={end}
                total={item.quantity}
                free={freeOn}
                onChange={(s, e) => { setStart(s); setEnd(e); }}
                onBlocked={(d) => toast.error(`${item.title} is fully booked on ${d.toDateString()}. Pick a shorter range.`)}
              />
            </section>
          </div>

          {/* Right: request panel */}
          <aside className="lg:sticky lg:top-24 h-fit space-y-4">
            <section className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">Your rental</h2>
              <LineRow title={item.title} rate={item.daily_rate} qty={qty[id] ?? 0} max={maxFor(id)} min={1} onChange={(n) => setQty((q) => ({ ...q, [id]: n }))} />
              {start && pickedOthers.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Add more from {item.vendor?.name}</p>
                  {pickedOthers.map((o) => (
                    <LineRow key={o.id} title={o.title} rate={o.daily_rate} qty={qty[o.id] ?? 0} max={maxFor(o.id)} min={0} onChange={(n) => setQty((q) => ({ ...q, [o.id]: n }))} />
                  ))}
                </div>
              )}
            </section>

            {start && (
              <>
                <section className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
                  <fieldset>
                    <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">How do you get it?</legend>
                    {offers.delivery && offers.pickup ? (
                      <div className="flex flex-wrap gap-2">
                        {(["delivery", "pickup"] as const).map((w) => (
                          <button
                            key={w}
                            type="button"
                            aria-pressed={way === w}
                            onClick={() => setHandover(w)}
                            className={`px-3 py-1.5 rounded-full text-sm border transition ${way === w ? "bg-primary text-primary-foreground border-primary" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary"}`}
                          >
                            {w === "delivery" ? "Delivery" : "I'll pick it up"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {offers.delivery ? "Delivered by the vendor." : offers.pickup ? "Pickup only: you collect it from the vendor." : "Some of these items are delivery only and some pickup only. Rent them separately."}
                      </p>
                    )}
                  </fieldset>
                  {way === "delivery" && (
                    <>
                      <LocationField value={{ label: venue }} onChange={(p) => setVenue(p.label)} label="Delivery address" placeholder="Delivery address" maxLength={500} street />
                      {quote?.delivery_terms && <p className="text-xs text-gray-500 dark:text-gray-400">Delivery fee: {quote.delivery_terms}.</p>}
                      {quote?.delivery?.message && <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">{quote.delivery.message}</p>}
                    </>
                  )}
                  {way === "pickup" && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">You&apos;ll see where to pick it up once the vendor accepts.</p>
                  )}
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Pickup time, colours, setup needs…" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                  <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Price</h2>
                  {quote ? (
                    <>
                      <Row label={`Rental · ${quote.days} day${quote.days > 1 ? "s" : ""}`} value={money(quote.subtotal)} />
                      {!!quote.delivery_fee && <Row label={`Delivery${quote.delivery?.label ? ` · ${quote.delivery.label}` : ""}`} value={money(quote.delivery_fee)} />}
                      <Row label="Vendly Protection fee" value={money(quote.service_fee)} />
                      <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
                      <Row label="Charged when accepted" value={money(quote.due_on_accept)} bold />
                      {quote.security_deposit > 0 && (
                        <div className="mt-3 p-3 rounded-xl bg-primary/5 space-y-1">
                          <Row label="Refundable security deposit" value={money(quote.security_deposit)} />
                          <p className="text-xs text-gray-500 dark:text-gray-400">Held on your card the day before pickup, not charged. Released when the vendor checks the items back in, unless they report damage or a late return.</p>
                        </div>
                      )}
                      {!quote.available && <p className="text-xs text-red-500">Some items don’t have enough stock for these dates.</p>}
                    </>
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  )}
                </section>

                {loggedIn && (
                  <section className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
                    <h2 className="font-semibold text-gray-900 dark:text-white">Payment method</h2>
                    <SavedCards selected={card} onSelect={setCard} />
                  </section>
                )}
              </>
            )}

            <button
              onClick={send}
              disabled={sending || !start}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              {!start ? "Pick dates to continue" : !loggedIn ? "Log in to request" : quote ? `Send request · ${money(quote.due_on_accept)}` : "Send request"}
            </button>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Nothing is charged until the vendor accepts.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
      <div className="text-primary">{icon}</div>
      <p className="font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function LineRow({ title, rate, qty, min, max, onChange }: { title: string; rate: number; qty: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</p>
        <p className={`text-xs ${max < 1 ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>{max < 1 ? "Booked for these dates" : `${money(rate)}/day · ${max} free`}</p>
      </div>
      <div className="flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-700 p-1">
        <button type="button" aria-label={`Fewer ${title}`} disabled={qty <= min} onClick={() => onChange(Math.max(min, qty - 1))} className="w-7 h-7 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-30"><Minus className="w-3.5 h-3.5" /></button>
        <input aria-label={`${title} quantity`} value={qty} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, "") || "0", 10); onChange(Math.min(Math.max(min, n), Math.max(min, max))); }} className="w-10 text-center bg-transparent text-sm font-semibold focus:outline-none" />
        <button type="button" aria-label={`More ${title}`} disabled={qty >= max} onClick={() => onChange(Math.min(max, qty + 1))} className="w-7 h-7 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-30"><Plus className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
