"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { ChatService } from "@/service/chat/chat.service";
import { errorMessage } from "@/service/rentals/rentals.service";

interface Pkg { id: string; title: string; price: number }

/** Vendor: send a custom price for one of their live packages. */
export default function SendQuoteModal({ conversationId, onClose, onSent }: { conversationId: string; onClose: () => void; onSent: () => void }) {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [listingId, setListingId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    VendorListingService.getMyListings({ page: 1, status: "ACTIVE", limit: 50 })
      .then((r) => {
        const list: Pkg[] = (r.data?.data ?? []).filter((l: { status?: string }) => !l.status || l.status === "ACTIVE").map((l: { id: string; title: string; price: number }) => ({ id: l.id, title: l.title, price: Number(l.price) }));
        setPackages(list);
        if (list[0]) {
          setListingId(list[0].id);
          setAmount(String(list[0].price));
        }
      })
      .catch(() => setPackages([]));
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!listingId) return toast.error("Pick the package this quote is for");
    if (!title.trim()) return toast.error("Say what the quote covers");
    if (!n || n < 1) return toast.error("Enter a price of at least $1");
    setBusy(true);
    try {
      await ChatService.sendQuote(conversationId, { listing_id: listingId, title: title.trim(), description: description.trim() || undefined, amount: n, expires_in_days: days });
      toast.success("Quote sent");
      onSent();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the quote"));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Send a quote">
      <form onSubmit={send} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Send a quote</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {!packages ? (
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        ) : packages.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Publish a package first. A quote sets a custom price on one of your live packages.</p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Package</span>
              <select className={input} value={listingId} onChange={(e) => setListingId(e.target.value)}>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.title} (${p.price.toFixed(2)})</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">What it covers</span>
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bridal party of 6, trial included" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Price ($)</span>
              <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Details (optional)</span>
              <textarea className={input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What’s included, timings, extras" />
            </label>
            <div className="text-sm">
              <span className="text-gray-600 dark:text-gray-300">Valid for</span>
              <div className="flex gap-2 mt-1">
                {[3, 7, 14].map((d) => (
                  <button type="button" key={d} onClick={() => setDays(d)} className={cn("px-3 py-1.5 rounded-full border text-sm", days === d ? "bg-primary text-primary-foreground border-primary" : "border-gray-200 dark:border-gray-700")}>{d} days</button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send quote
            </button>
          </>
        )}
      </form>
    </div>
  );
}
