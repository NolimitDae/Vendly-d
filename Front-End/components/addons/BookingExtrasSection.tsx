"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { HandCoins, Loader2, Plus, Receipt } from "lucide-react";
import { toast } from "react-toastify";
import {
  AddOnsService,
  BookingExtrasService,
  type AddOn,
  type AddOnKind,
  type AddOnUnit,
  type Extra,
  type ExtrasMeta,
  type GiveBackResult,
} from "@/service/add-ons/add-ons.service";
import { PaymentsService } from "@/service/payments/payments.service";
import { apiError } from "@/service/contracts/contracts.service";
import SavedCards from "@/components/payments/SavedCards";
import { ADD_ON_UNITS, money } from "@/lib/addons";

type Role = "CUSTOMER" | "VENDOR";

const btn = "px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-60";
const primaryBtn = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const outlineBtn = `${btn} border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300`;
const fieldCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1";

/** Status chip text and colour, from the customer's or the vendor's side. */
export function extraStatus(e: Extra, role: Role): { label: string; cls: string } {
  const pay = e.payment?.status;
  switch (e.status) {
    case "PENDING":
      return { label: role === "CUSTOMER" ? "Needs your approval" : "Waiting for the customer", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
    case "APPROVED":
      if (pay === "FAILED") return { label: "Payment problem", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300" };
      if (pay === "REFUNDED") return { label: "Refunded", cls: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" };
      if (pay === "PAID") return { label: "Paid", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
      return { label: "Approved", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" };
    case "DECLINED":
      return { label: "Declined", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300" };
    case "CANCELLED":
      return { label: "Withdrawn", cls: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" };
    case "IN_REVIEW":
      return { label: "Vendly is reviewing", cls: "bg-primary/10 text-primary" };
    case "WAIVED":
      return { label: "Waived by Vendly", cls: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" };
    default:
      return { label: "Included", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
  }
}

const QTY_LABEL: Record<AddOnUnit, string> = {
  FIXED: "",
  PER_PERSON: "Guests (blank = guests on the booking)",
  PER_HOUR: "Hours (1.5 is fine)",
  PER_ITEM: "How many",
};

/**
 * Add-ons and fees on a booking. Customers approve or decline what the vendor sends;
 * vendors send add-ons and fees, withdraw them, ask Vendly to review a fee, and give money back.
 */
export default function BookingExtrasSection({
  bookingId,
  role,
  bookingStatus,
  onChanged,
}: {
  bookingId: string;
  role: Role;
  bookingStatus?: string;
  onChanged?: () => void;
}) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [meta, setMeta] = useState<ExtrasMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // one open panel at a time: "decline:<id>", "card:<id>", "escalate:<id>", "request:FEE", "giveback"
  const [panel, setPanel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [giveResult, setGiveResult] = useState<GiveBackResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await BookingExtrasService.list(bookingId);
      setExtras(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
    } catch {
      setExtras([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (p: string | null) => {
    setPanel(p);
    setText("");
    setCard(null);
  };

  const run = async (key: string, fn: () => Promise<unknown>, fail: string) => {
    setBusy(key);
    try {
      await fn();
      open(null);
      await load();
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(apiError(e, fail));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const approve = (e: Extra, cardId?: string) => {
    if (!confirm(`Approve ${e.name} and pay ${money(e.total)} now?`)) return;
    run(
      e.id,
      async () => {
        const res = await BookingExtrasService.approve(e.id, cardId);
        const d = res.data?.data;
        if (d && d.paid === false) toast.error(d.payment?.last_error ? `Approved, but the payment didn't go through: ${d.payment.last_error}` : "Approved, but the payment didn't go through. Try again or use another card.");
        else toast.success("Approved and paid");
      },
      "Couldn't approve",
    );
  };

  const decline = (e: Extra) =>
    run(e.id, async () => {
      await BookingExtrasService.decline(e.id, text.trim() || undefined);
      toast.success("Declined. The vendor has been told.");
    }, "Couldn't decline");

  const retry = (e: Extra, cardId?: string) =>
    run(e.id, async () => {
      await PaymentsService.retry(bookingId, e.payment!.installment_id, cardId);
      toast.success("Payment sent");
    }, "Payment failed again");

  const withdraw = (e: Extra) => {
    if (!confirm(`Withdraw ${e.name}? The customer won't be charged for it.`)) return;
    run(e.id, async () => {
      await BookingExtrasService.withdraw(e.id);
      toast.success("Withdrawn");
    }, "Couldn't withdraw");
  };

  const escalate = (e: Extra) => {
    if (text.trim().length < 10) return toast.error("Tell Vendly what happened (at least 10 characters).");
    run(e.id, async () => {
      await BookingExtrasService.escalate(e.id, text.trim());
      toast.success("Sent to Vendly. We'll email you both when it's decided.");
    }, "Couldn't send");
  };

  if (loading) return null;
  if (role === "CUSTOMER" && extras.length === 0) return null;

  const included = extras.filter((e) => e.status === "INCLUDED");
  const requests = extras.filter((e) => e.status !== "INCLUDED");
  const canGiveBack = role === "VENDOR" && ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(bookingStatus ?? "");
  const now = Date.now();

  return (
    <section aria-labelledby="extras-heading" className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-primary" aria-hidden />
        <h2 id="extras-heading" className="font-semibold text-gray-900 dark:text-white">Add-ons and fees</h2>
      </div>

      {role === "CUSTOMER" && meta && meta.waiting_on_customer > 0 && (
        <p className="text-sm rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-3 py-2">
          {meta.waiting_on_customer === 1 ? "1 request needs" : `${meta.waiting_on_customer} requests need`} your approval ({money(meta.waiting_total)}). Nothing is charged until you approve.
        </p>
      )}

      {included.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Included add-ons</p>
          <ul className="space-y-1">
            {included.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
                <span>{e.label}</span>
                <span>{money(e.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-1">Already in the booking price.</p>
        </div>
      )}

      {requests.length > 0 && (
        <ul className="space-y-3">
          {requests.map((e) => {
            const st = extraStatus(e, role);
            const failed = e.status === "APPROVED" && e.payment?.status === "FAILED";
            const canEscalate =
              role === "VENDOR" &&
              e.kind === "FEE" &&
              !e.review_requested_at &&
              (e.status === "DECLINED" || (e.status === "PENDING" && !!e.can_escalate_at && new Date(e.can_escalate_at).getTime() <= now));
            const canWithdraw = role === "VENDOR" && ["PENDING", "DECLINED", "IN_REVIEW"].includes(e.status);
            return (
              <li key={e.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {e.kind === "FEE" ? "Fee" : "Add-on"} · {dayjs(e.created_at).format("MMM D, YYYY")}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">{e.label}</p>
                    {e.description && <p className="text-xs text-gray-500 dark:text-gray-400">{e.description}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">{money(e.total)}</p>
                    {e.fee_amount > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{money(e.amount)} + {money(e.fee_amount)} Vendly Protection fee</p>
                    )}
                    <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
                {e.note && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">{role === "CUSTOMER" ? "Vendor's reason: " : "Your note: "}</span>
                    {e.note}
                  </p>
                )}
                {e.decline_reason && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">{role === "CUSTOMER" ? "Your reason: " : "Customer's reason: "}</span>
                    {e.decline_reason}
                  </p>
                )}
                {e.status === "IN_REVIEW" && <p className="text-xs text-gray-500 dark:text-gray-400">Vendly will check the contract and decide. You&apos;ll both get an email.</p>}
                {e.reviewed_at && e.review_note && <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">{e.review_note}</p>}
                {failed && e.payment?.last_error && <p className="text-xs text-red-500">{e.payment.last_error}</p>}
                {role === "VENDOR" && e.kind === "FEE" && e.status === "PENDING" && e.can_escalate_at && new Date(e.can_escalate_at).getTime() > now && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">If there&apos;s no answer, you can ask Vendly to review it from {dayjs(e.can_escalate_at).format("MMM D, h:mm A")}.</p>
                )}

                {/* customer actions */}
                {role === "CUSTOMER" && (e.status === "PENDING" || failed) && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {e.status === "PENDING" ? (
                        <>
                          <button type="button" disabled={busy === e.id} onClick={() => approve(e)} className={primaryBtn}>
                            Approve and pay {money(e.total)}
                          </button>
                          <button type="button" disabled={busy === e.id} onClick={() => open(panel === `decline:${e.id}` ? null : `decline:${e.id}`)} className={outlineBtn}>
                            Decline
                          </button>
                        </>
                      ) : (
                        <button type="button" disabled={busy === e.id} onClick={() => retry(e)} className={primaryBtn}>
                          Retry payment
                        </button>
                      )}
                      <button type="button" onClick={() => open(panel === `card:${e.id}` ? null : `card:${e.id}`)} className="text-sm font-semibold text-primary px-1">
                        Use another card
                      </button>
                    </div>
                    {panel === `card:${e.id}` && (
                      <div className="space-y-2">
                        <SavedCards selected={card} onSelect={setCard} />
                        <button
                          type="button"
                          disabled={!card || busy === e.id}
                          onClick={() => (e.status === "PENDING" ? approve(e, card!) : retry(e, card!))}
                          className={primaryBtn}
                        >
                          {e.status === "PENDING" ? `Approve and pay ${money(e.total)} with this card` : "Pay with this card"}
                        </button>
                      </div>
                    )}
                    {panel === `decline:${e.id}` && (
                      <div className="space-y-2">
                        <label htmlFor={`decline-${e.id}`} className={labelCls}>Reason (optional, the vendor sees it)</label>
                        <textarea id={`decline-${e.id}`} rows={2} maxLength={1000} value={text} onChange={(ev) => setText(ev.target.value)} className={fieldCls} />
                        <button type="button" disabled={busy === e.id} onClick={() => decline(e)} className={primaryBtn}>
                          Decline {e.kind === "FEE" ? "fee" : "add-on"}
                        </button>
                        {e.kind === "FEE" && <p className="text-xs text-gray-500 dark:text-gray-400">The vendor can ask Vendly to review a declined fee against the contract.</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* vendor actions */}
                {role === "VENDOR" && (canWithdraw || canEscalate) && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {canEscalate && (
                        <button type="button" onClick={() => open(panel === `escalate:${e.id}` ? null : `escalate:${e.id}`)} className={outlineBtn}>
                          Ask Vendly to review
                        </button>
                      )}
                      {canWithdraw && (
                        <button type="button" disabled={busy === e.id} onClick={() => withdraw(e)} className={`${btn} text-red-600 border border-red-200 dark:border-red-900`}>
                          Withdraw
                        </button>
                      )}
                    </div>
                    {panel === `escalate:${e.id}` && (
                      <div className="space-y-2">
                        <label htmlFor={`escalate-${e.id}`} className={labelCls}>What happened? Vendly reads this with the contract and any proof photos.</label>
                        <textarea id={`escalate-${e.id}`} rows={3} maxLength={2000} value={text} onChange={(ev) => setText(ev.target.value)} className={fieldCls} />
                        <button type="button" disabled={busy === e.id || text.trim().length < 10} onClick={() => escalate(e)} className={primaryBtn}>
                          Send to Vendly
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {role === "VENDOR" && (
        <>
          {extras.length === 0 && <p className="text-sm text-gray-400">Nothing yet.</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={!meta?.can_request.fee} onClick={() => open(panel === "request:FEE" ? null : "request:FEE")} className={outlineBtn} aria-expanded={panel === "request:FEE"}>
              <Plus className="w-4 h-4 inline mr-1" aria-hidden />Request a fee
            </button>
            <button type="button" disabled={!meta?.can_request.add_on} onClick={() => open(panel === "request:ADD_ON" ? null : "request:ADD_ON")} className={outlineBtn} aria-expanded={panel === "request:ADD_ON"}>
              <Plus className="w-4 h-4 inline mr-1" aria-hidden />Add an add-on
            </button>
            {canGiveBack && (
              <button type="button" onClick={() => { open(panel === "giveback" ? null : "giveback"); setGiveResult(null); }} className={outlineBtn} aria-expanded={panel === "giveback"}>
                <HandCoins className="w-4 h-4 inline mr-1" aria-hidden />Give money back
              </button>
            )}
          </div>
          {meta && (!meta.can_request.fee || !meta.can_request.add_on) && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {!meta.can_request.add_on && !meta.can_request.fee
                ? "Add-ons can be sent once the booking is confirmed, and fees once the job starts, up to 14 days after it's complete."
                : "Fees can be sent once the job starts, up to 14 days after it's complete."}
            </p>
          )}
          {(panel === "request:FEE" || panel === "request:ADD_ON") && (
            <RequestForm
              kind={panel === "request:FEE" ? "FEE" : "ADD_ON"}
              busy={busy === "request"}
              onCancel={() => open(null)}
              onSend={(body) =>
                run("request", async () => {
                  await BookingExtrasService.request(bookingId, body);
                  toast.success("Sent to the customer for approval");
                }, "Couldn't send")
              }
            />
          )}
          {panel === "giveback" && (
            <GiveBackForm
              busy={busy === "giveback"}
              onCancel={() => open(null)}
              onSend={async (amount, reason) => {
                if (!confirm(`Give ${money(amount)} back to the customer? It comes out of your earnings for this booking.`)) return;
                setBusy("giveback");
                try {
                  const res = await BookingExtrasService.giveBack(bookingId, amount, reason);
                  setGiveResult(res.data?.data ?? null);
                  setPanel(null);
                  toast.success(`${money(amount)} given back`);
                  await load();
                  onChanged?.();
                } catch (e) {
                  toast.error(apiError(e, "Couldn't give money back"));
                } finally {
                  setBusy(null);
                }
              }}
            />
          )}
          {giveResult && (
            <div role="status" className="rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm px-3 py-2 space-y-0.5">
              <p className="font-medium">{money(giveResult.amount)} given back.</p>
              {giveResult.lowered > 0 && <p>{money(giveResult.lowered)} came off what the customer still owes.</p>}
              {giveResult.refunded > 0 && <p>{money(giveResult.refunded)} was refunded to their card.</p>}
              {giveResult.recovered_from_balance > 0 && <p>{money(giveResult.recovered_from_balance)} was taken from your balance, since you&apos;d already been paid.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Vendor: an add-on or fee for this booking, from the library or typed in. */
function RequestForm({
  kind,
  busy,
  onCancel,
  onSend,
}: {
  kind: AddOnKind;
  busy: boolean;
  onCancel: () => void;
  onSend: (body: Parameters<typeof BookingExtrasService.request>[1]) => void;
}) {
  const [library, setLibrary] = useState<AddOn[]>([]);
  const [fromId, setFromId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<AddOnUnit>("FIXED");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const word = kind === "FEE" ? "fee" : "add-on";

  useEffect(() => {
    AddOnsService.list({ kind })
      .then((res) => setLibrary(res.data?.data ?? []))
      .catch(() => setLibrary([]));
  }, [kind]);

  const pick = (id: string) => {
    setFromId(id);
    const a = library.find((x) => x.id === id);
    if (a) {
      setName(a.name);
      setPrice(String(a.price));
      setUnit(a.price_unit);
      setQty("");
    }
  };

  const q = unit === "FIXED" ? 1 : qty ? Number(qty) : unit === "PER_PERSON" ? null : 1;
  const amount = q !== null && Number(price) > 0 ? Math.round(Number(price) * q * 100) / 100 : null;

  const send = () => {
    if (name.trim().length < 2) return toast.error("Give it a name the customer will recognise.");
    if (!(Number(price) >= 0.5)) return toast.error("Enter a price.");
    if (qty && !(Number(qty) > 0)) return toast.error("Enter a quantity.");
    if (qty && unit !== "PER_HOUR" && !Number.isInteger(Number(qty))) return toast.error("Only hours can be a fraction (like 1.5).");
    if (kind === "FEE" && note.trim().length < 3) return toast.error("Say why you're charging this fee. The customer sees it.");
    onSend({
      kind,
      add_on_id: fromId || undefined,
      name: name.trim(),
      unit_price: Math.round(Number(price) * 100) / 100,
      price_unit: unit,
      quantity: unit !== "FIXED" && qty ? Number(qty) : undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <p className="font-medium text-gray-900 dark:text-white">{kind === "FEE" ? "Request a fee" : "Add an add-on"}</p>
      {library.length > 0 && (
        <div>
          <label htmlFor="extra-from" className={labelCls}>From your library</label>
          <select id="extra-from" value={fromId} onChange={(e) => (e.target.value ? pick(e.target.value) : setFromId(""))} className={fieldCls}>
            <option value="">Custom {word}</option>
            {library.map((a) => (
              <option key={a.id} value={a.id}>{a.name} · {a.price_text}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor="extra-name" className={labelCls}>Name</label>
          <input id="extra-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={kind === "FEE" ? "e.g. Late return" : "e.g. Extra hour"} className={fieldCls} />
        </div>
        <div>
          <label htmlFor="extra-price" className={labelCls}>Price</label>
          <input id="extra-price" type="number" min="0.5" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label htmlFor="extra-unit" className={labelCls}>Priced</label>
          <select id="extra-unit" value={unit} onChange={(e) => setUnit(e.target.value as AddOnUnit)} className={fieldCls}>
            {ADD_ON_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.value === "PER_ITEM" ? "Each" : u.label}</option>
            ))}
          </select>
        </div>
        {unit !== "FIXED" && (
          <div>
            <label htmlFor="extra-qty" className={labelCls}>{QTY_LABEL[unit]}</label>
            <input id="extra-qty" type="number" min={unit === "PER_HOUR" ? "0.5" : "1"} step={unit === "PER_HOUR" ? "0.5" : "1"} value={qty} onChange={(e) => setQty(e.target.value)} className={fieldCls} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="extra-note" className={labelCls}>Reason the customer will see{kind === "FEE" ? "" : " (optional)"}</label>
          <textarea id="extra-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "FEE" ? "e.g. Chairs came back 3 hours late" : "e.g. You asked for an extra hour on the night"} className={fieldCls} />
        </div>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300" aria-live="polite">
        {amount !== null ? <>The customer will be asked to approve <span className="font-semibold">{money(amount)}</span></> : "The amount is worked out from the guests on the booking"}
        {kind === "ADD_ON" ? ", plus the Vendly Protection fee." : ". No Vendly fee is added to fees."}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={outlineBtn}>Cancel</button>
        <button type="button" disabled={busy} onClick={send} className={`${primaryBtn} flex items-center gap-2`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send for approval
        </button>
      </div>
    </div>
  );
}

/** Vendor: money off for the customer, from the vendor's part. */
function GiveBackForm({ busy, onCancel, onSend }: { busy: boolean; onCancel: () => void; onSend: (amount: number, reason: string) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const send = () => {
    const n = Math.round(Number(amount) * 100) / 100;
    if (!(n >= 1)) return toast.error("Enter at least $1.00.");
    if (reason.trim().length < 3) return toast.error("Add a short reason the customer will see.");
    onSend(n, reason.trim());
  };
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <p className="font-medium text-gray-900 dark:text-white">Give money back</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        It first lowers what the customer still owes, then refunds from what they&apos;ve paid. It comes out of your part; the Vendly fee isn&apos;t refunded.
      </p>
      <div>
        <label htmlFor="giveback-amount" className={labelCls}>Amount</label>
        <input id="giveback-amount" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldCls} />
      </div>
      <div>
        <label htmlFor="giveback-reason" className={labelCls}>Reason the customer will see</label>
        <textarea id="giveback-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We started 30 minutes late" className={fieldCls} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={outlineBtn}>Cancel</button>
        <button type="button" disabled={busy} onClick={send} className={`${primaryBtn} flex items-center gap-2`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Give money back
        </button>
      </div>
    </div>
  );
}
