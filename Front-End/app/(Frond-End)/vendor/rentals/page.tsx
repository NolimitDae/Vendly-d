"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Edit2, Loader2, Package, Pause, Play, Plus, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { RentalsService, errorMessage, money, type RentalItem, type RentalReservation } from "@/service/rentals/rentals.service";
import LicenceNotice from "@/components/vendor/LicenceNotice";
import LocationField from "@/components/listing/LocationField";
import DosDontsFields from "@/components/listing/DosDontsFields";
import { appendDosDonts, dosDontsError, dosDontsFrom, type DosDonts } from "@/lib/package-options";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  PAUSED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Live", DRAFT: "Draft", PAUSED: "Paused" };

export default function VendorRentalsPage() {
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RentalItem | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await RentalsService.mine();
      if (res.data?.success) setItems(res.data.data);
    } catch {
      toast.error("Failed to load your rental items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (item: RentalItem) => {
    try {
      await RentalsService.setStatus(item.id, item.status === "ACTIVE" ? "PAUSED" : "ACTIVE");
      load();
    } catch (e) {
      toast.error(errorMessage(e, "Could not update"));
    }
  };
  const remove = async (item: RentalItem) => {
    if (!confirm(`Delete “${item.title}”? Customers will no longer see it.`)) return;
    try {
      await RentalsService.remove(item.id);
      toast.success("Item removed");
      load();
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete"));
    }
  };

  const units = items.reduce((n, i) => n + i.quantity, 0);
  const out = items.reduce((n, i) => n + (i.quantity - (i.available_today ?? i.quantity)), 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rental Inventory</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Items customers rent by the day. Stock is tracked per date.</p>
          </div>
          <button onClick={() => setEditing("new")} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition text-sm">
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>

        <LicenceNotice things="rental items" />

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <Package className="w-12 h-12 mx-auto text-primary mb-3" />
            <p className="text-lg font-semibold text-gray-900 dark:text-white">Rent out your gear</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">List chairs, decor, lighting or AV by the day. Vendly tracks stock per date, holds a security deposit and pays you when it comes back.</p>
            <button onClick={() => setEditing("new")} className="mt-5 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm">Add your first item</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Stat label="Items" value={items.length} />
              <Stat label="Units" value={units} />
              <Stat label="Out today" value={out} />
            </div>
            <div className="space-y-3">
              {items.map((item) => {
                const freeToday = item.available_today ?? item.quantity;
                return (
                  <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <div className="p-4 flex gap-4">
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                        {item.images[0] ? <Image src={item.images[0]} alt={item.title} fill className="object-cover" unoptimized /> : <Package className="w-7 h-7 text-gray-400 absolute inset-0 m-auto" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{money(item.daily_rate)}/day · {item.deposit_amount > 0 ? `${money(item.deposit_amount)} deposit` : "no deposit"} · turnaround {item.turnaround_hours}h</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_STYLES[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-1.5 flex-1 max-w-xs rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${item.quantity ? (freeToday / item.quantity) * 100 : 0}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{freeToday} of {item.quantity} free today</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <SmallButton onClick={() => setOpen(open === item.id ? null : item.id)} icon={<ChevronDown className={cn("w-3.5 h-3.5 transition", open === item.id && "rotate-180")} />}>Stock & rentals</SmallButton>
                          <SmallButton onClick={() => setEditing(item)} icon={<Edit2 className="w-3.5 h-3.5" />}>Edit</SmallButton>
                          <SmallButton onClick={() => toggle(item)} icon={item.status === "ACTIVE" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}>{item.status === "ACTIVE" ? "Pause" : "Make live"}</SmallButton>
                          <SmallButton onClick={() => remove(item)} icon={<Trash2 className="w-3.5 h-3.5" />} danger>Delete</SmallButton>
                        </div>
                      </div>
                    </div>
                    {open === item.id && <StockPanel itemId={item.id} />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      {editing && <ItemForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function StockPanel({ itemId }: { itemId: string }) {
  const [data, setData] = useState<(RentalItem & { reservations: RentalReservation[] }) | null>(null);
  useEffect(() => {
    RentalsService.mineOne(itemId).then((r) => r.data?.success && setData(r.data.data)).catch(() => toast.error("Could not load stock"));
  }, [itemId]);
  if (!data) return <div className="px-4 pb-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  const cal = data.calendar ?? [];
  const pad = cal.length ? new Date(cal[0].date + "T00:00:00").getDay() : 0;
  const upcoming = data.reservations.filter((r) => r.status === "ACTIVE");
  const fmt = (s: string) => new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 p-4 grid md:grid-cols-2 gap-6">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Next 60 days</p>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => <span key={i} className="text-[10px] text-gray-400">{w}</span>)}
          {Array.from({ length: pad }).map((_, i) => <span key={`p${i}`} />)}
          {cal.map((c) => {
            const ratio = data.quantity ? c.available / data.quantity : 0;
            const d = new Date(c.date + "T00:00:00");
            return (
              <span
                key={c.date}
                title={`${d.toDateString()}: ${c.available} of ${data.quantity} free`}
                className={cn("aspect-square rounded-md text-[11px] flex items-center justify-center", ratio >= 1 ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" : ratio > 0 ? "bg-primary/60 text-white" : "bg-rose-500 text-white")}
              >
                {d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: "short" }) : d.getDate()}
              </span>
            );
          })}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-700" /> All free</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/60" /> Some out</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500" /> Fully booked</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Upcoming rentals</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming rentals for this item.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((r) => (
              <li key={r.id}>
                <Link href={`/vendor/bookings/${r.booking.id}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <span className="w-11 h-11 rounded-lg bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">×{r.quantity}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{r.booking.customer?.name ?? "Customer"}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{fmt(r.start_date)} → {fmt(r.end_date)} · {r.booking.status.toLowerCase().replace("_", " ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ItemForm({ item, onClose, onSaved }: { item: RentalItem | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [rate, setRate] = useState(item ? String(item.daily_rate) : "");
  const [deposit, setDeposit] = useState(item?.deposit_amount ? String(item.deposit_amount) : "");
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : "1");
  const [turnaround, setTurnaround] = useState(item?.turnaround_hours ?? 24);
  const [location, setLocation] = useState(item?.location ?? "");
  // how the customer gets it: delivered, picked up, or either
  const [delivers, setDelivers] = useState(item?.offers_delivery ?? true);
  const [pickup, setPickup] = useState(item?.offers_pickup ?? true);
  const [keep, setKeep] = useState<{ key: string; url: string }[]>((item?.image_keys ?? []).map((key, i) => ({ key, url: item!.images[i] })));
  const [files, setFiles] = useState<File[]>([]);
  const [dosDonts, setDosDonts] = useState<DosDonts>(dosDontsFrom(item ?? {}));
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const daily = Number(rate);
    const qty = parseInt(quantity, 10);
    const dep = deposit.trim() ? Number(deposit) : 0;
    if (!title.trim()) return toast.error("Give the item a name");
    if (!daily || daily < 0.5) return toast.error("Enter a daily rate of at least $0.50");
    if (!qty || qty < 1) return toast.error("Quantity must be at least 1");
    if (Number.isNaN(dep) || dep < 0) return toast.error("Enter a valid deposit, or leave it empty");
    if (!delivers && !pickup) return toast.error("Offer delivery, pickup, or both");
    const dosProblem = dosDontsError(dosDonts);
    if (dosProblem) return toast.error(dosProblem);
    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("daily_rate", String(daily));
    fd.append("deposit_amount", String(dep));
    fd.append("quantity", String(qty));
    fd.append("turnaround_hours", String(turnaround));
    fd.append("offers_delivery", String(delivers));
    fd.append("offers_pickup", String(pickup));
    if (location.trim()) fd.append("location", location.trim());
    if (item) fd.append("keep_images", JSON.stringify(keep.map((k) => k.key)));
    appendDosDonts(fd, dosDonts, !!item);
    files.forEach((f) => fd.append("images", f));
    setSaving(true);
    try {
      const res = await RentalsService.save(fd, item?.id);
      if (res.data?.success === false) throw new Error(res.data?.message);
      toast.success(item ? "Item updated" : "Item listed");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={item ? "Edit rental item" : "Add rental item"}>
      <form onSubmit={save} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{item ? "Edit rental item" : "Add rental item"}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-300">Item name</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Gold Chiavari Chair" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-300">Description</span>
          <textarea className={input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Size, colour, condition, delivery or pickup…" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm"><span className="text-gray-600 dark:text-gray-300">Daily rate ($)</span><input className={input} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
          <label className="block text-sm"><span className="text-gray-600 dark:text-gray-300">Deposit / unit ($)</span><input className={input} inputMode="decimal" value={deposit} placeholder="0" onChange={(e) => setDeposit(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
          <label className="block text-sm"><span className="text-gray-600 dark:text-gray-300">Quantity</span><input className={input} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} /></label>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">The deposit is held on the customer’s card the day before pickup and only taken if you report damage or a late return.</p>
        <div className="text-sm">
          <span className="text-gray-600 dark:text-gray-300">Turnaround between rentals</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {[0, 12, 24, 48].map((h) => (
              <button type="button" key={h} onClick={() => setTurnaround(h)} className={cn("px-3 py-1.5 rounded-full border text-sm", turnaround === h ? "bg-primary text-primary-foreground border-primary" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300")}>
                {h === 0 ? "None" : h === 12 ? "12 hours" : h === 24 ? "1 day" : "2 days"}
              </button>
            ))}
          </div>
        </div>
        <fieldset className="text-sm">
          <legend className="text-gray-600 dark:text-gray-300">How customers get it</legend>
          <div className="flex flex-wrap gap-4 mt-1">
            <label className="flex items-center gap-2"><input type="checkbox" checked={delivers} onChange={(e) => setDelivers(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />I deliver it</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />Customers pick it up</label>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {pickup ? "Customers who pick up see your business address (set in your profile) once you accept." : "Customers enter the delivery address when they book."}
          </p>
        </fieldset>
        <div className="block text-sm">
          <label htmlFor="rental-pickup" className="text-gray-600 dark:text-gray-300">Pickup location</label>
          <LocationField value={{ label: location }} onChange={(p) => setLocation(p.label)} inputId="rental-pickup" placeholder="City, State" />
        </div>
        <DosDontsFields plain value={dosDonts} onChange={setDosDonts} />
        <div className="text-sm space-y-2">
          <span className="text-gray-600 dark:text-gray-300">Photos</span>
          <div className="flex flex-wrap gap-2">
            {keep.map((k) => (
              <div key={k.key} className="relative w-16 h-16 rounded-lg overflow-hidden">
                <Image src={k.url} alt="" fill className="object-cover" unoptimized />
                <button type="button" aria-label="Remove photo" onClick={() => setKeep((p) => p.filter((x) => x.key !== k.key))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {files.map((f, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 text-[10px] p-1 overflow-hidden">
                {f.name}
                <button type="button" aria-label="Remove photo" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 10 - keep.length))} className="text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {item ? "Save changes" : "List item"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function SmallButton({ children, icon, onClick, danger }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition", danger ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700")}>
      {icon}
      {children}
    </button>
  );
}
