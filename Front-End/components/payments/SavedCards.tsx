"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Landmark, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { BANK_CLEARING_TEXT, isBankAccount, PaymentsService, type SavedCard } from "@/service/payments/payments.service";

export const cardBrand = (b?: string) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : "Card");
/** "Visa •••• 4242" or "Bank account •••• 6789" */
export const methodLabel = (m: SavedCard) => (isBankAccount(m) ? `Bank account •••• ${m.last4}` : `${cardBrand(m.brand)} •••• ${m.last4}`);

/** The authorization the customer gives when saving a bank account (ACH debits need it). */
export const BANK_MANDATE_TEXT =
  "By saving this bank account, you authorize Vendly to debit it for the payments due on bookings you choose to pay with it (deposits, balances and add-ons you approve), under the Vendly Terms of Service, until you remove it. You can remove it at any time in Payment methods. Bank payments take about 4 business days to clear.";

/**
 * Connects a US bank account with Stripe (the customer signs in to their bank in Stripe's window, so
 * it's verified straight away), shows the authorization, then saves it. Loaded on demand like the card form.
 */
function AddBankForm({ onSaved, onCancel }: { onSaved: (id: string) => void; onCancel: () => void }) {
  const [stripe, setStripe] = useState<any>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // the account picked in Stripe's window, waiting for the customer to authorize it
  const [picked, setPicked] = useState<{ last4?: string; bank?: string | null } | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      setError("Bank payments are not configured on this site yet.");
      return;
    }
    Promise.all([import("@stripe/stripe-js"), PaymentsService.setupIntent("us_bank_account")])
      .then(async ([stripeJs, res]) => {
        const s = res.data?.data?.client_secret;
        if (!s) throw new Error("Could not start bank setup");
        setStripe(await stripeJs.loadStripe(key));
        setSecret(s);
      })
      .catch((e) => setError(e?.response?.data?.message ?? e?.message ?? "Could not start bank setup"));
  }, []);

  const connect = async () => {
    if (!stripe || !secret || name.trim().length < 2) return;
    setBusy(true);
    const { setupIntent, error: err } = await stripe.collectBankAccountForSetup({
      clientSecret: secret,
      params: { payment_method_type: "us_bank_account", payment_method_data: { billing_details: { name: name.trim() } } },
      expand: ["payment_method"],
    });
    setBusy(false);
    if (err) return toast.error(err.message ?? "The bank account was not connected");
    // closed Stripe's window without picking an account
    if (setupIntent?.status === "requires_payment_method") return;
    const pm = typeof setupIntent?.payment_method === "object" ? setupIntent.payment_method : null;
    setPicked({ last4: pm?.us_bank_account?.last4, bank: pm?.us_bank_account?.bank_name });
  };

  const authorize = async () => {
    if (!stripe || !secret) return;
    setBusy(true);
    const { setupIntent, error: err } = await stripe.confirmUsBankAccountSetup(secret);
    setBusy(false);
    if (err) return toast.error(err.message ?? "The bank account was not saved");
    if (setupIntent?.status !== "succeeded") return toast.error("Your bank needs more checks before it can be used. Please pay with a card for now.");
    const id = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id;
    if (!id) return toast.error("The bank account was not saved");
    toast.success("Bank account saved");
    onSaved(id);
  };

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!stripe || !secret) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  return (
    <div className="space-y-3" data-testid="add-bank">
      {picked ? (
        <>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{picked.bank ? `${picked.bank} ` : ""}Bank account •••• {picked.last4}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300">{BANK_MANDATE_TEXT}</p>
        </>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-xs text-gray-600 dark:text-gray-300">Account holder name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">You sign in to your bank in a secure Stripe window to connect your account. Nothing is taken until a vendor accepts your request.</p>
        </>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
        {picked ? (
          <button type="button" onClick={authorize} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Agree and save
          </button>
        ) : (
          <button type="button" onClick={connect} disabled={busy || name.trim().length < 2} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Connect your bank
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Stripe's card form inside its own Elements provider. Loaded on demand so pages that only list
 * cards never pull Stripe's script, and tests never touch it.
 */
function AddCardForm({ onSaved, onCancel }: { onSaved: (id: string) => void; onCancel: () => void }) {
  const [mods, setMods] = useState<{ stripe: any; react: any } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      setError("Card payments are not configured on this site yet.");
      return;
    }
    Promise.all([import("@stripe/stripe-js"), import("@stripe/react-stripe-js"), PaymentsService.setupIntent()])
      .then(([stripeJs, reactStripe, res]) => {
        const s = res.data?.data?.client_secret;
        if (!s) throw new Error("Could not start card setup");
        setMods({ stripe: stripeJs.loadStripe(key), react: reactStripe });
        setSecret(s);
      })
      .catch((e) => setError(e?.response?.data?.message ?? e?.message ?? "Could not start card setup"));
  }, []);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!mods || !secret) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  const { Elements } = mods.react;
  return (
    <Elements stripe={mods.stripe} options={{ clientSecret: secret, appearance: { theme: "night", variables: { colorPrimary: "#A84AB0" } } }}>
      <CardFields react={mods.react} secret={secret} onSaved={onSaved} onCancel={onCancel} />
    </Elements>
  );
}

function CardFields({ react, secret, onSaved, onCancel }: { react: any; secret: string; onSaved: (id: string) => void; onCancel: () => void }) {
  const { CardElement, useStripe, useElements } = react;
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    const { setupIntent, error } = await stripe.confirmCardSetup(secret, { payment_method: { card: elements.getElement(CardElement) } });
    setSaving(false);
    if (error) return toast.error(error.message ?? "Card was not saved");
    const id = typeof setupIntent?.payment_method === "string" ? setupIntent.payment_method : setupIntent?.payment_method?.id;
    if (!id) return toast.error("Card was not saved");
    toast.success("Card saved");
    onSaved(id);
  };

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardElement options={{ hidePostalCode: true, style: { base: { fontSize: "16px" } } }} />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Saved securely with Stripe. Nothing is charged until a vendor accepts your request.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
        <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save card
        </button>
      </div>
    </div>
  );
}

/**
 * The customer's saved cards. In `select` mode it works as a picker (booking request); otherwise
 * it manages cards (settings). With `allowBank`, saved bank accounts are listed and one can be added
 * (large bookings, and Payment methods); `bankNote` says when they can be used.
 */
export default function SavedCards({ selected, onSelect, allowBank, bankNote }: { selected?: string | null; onSelect?: (id: string | null) => void; allowBank?: boolean; bankNote?: string }) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<"card" | "bank" | null>(null);
  const selectable = !!onSelect;

  const load = useCallback(async () => {
    try {
      const res = await PaymentsService.cards(allowBank ? { bank: true } : {});
      const list: SavedCard[] = res.data?.data ?? [];
      setCards(list);
      if (selectable && !selected) onSelect?.((list.find((c) => c.is_default) ?? list[0])?.id ?? null);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowBank]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (c: SavedCard) => {
    if (!confirm(`Remove ${isBankAccount(c) ? "the bank account" : cardBrand(c.brand)} ending ${c.last4}?`)) return;
    try {
      await PaymentsService.removeCard(c.id);
      if (selected === c.id) onSelect?.(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not remove card");
    }
  };

  const makeDefault = async (c: SavedCard) => {
    try {
      await PaymentsService.setDefault(c.id);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not update card");
    }
  };

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;

  return (
    <div className="space-y-2">
      {cards.length === 0 && !adding && <p className="text-sm text-gray-500 dark:text-gray-400">No saved cards yet.</p>}
      {cards.map((c) => {
        const on = selected === c.id;
        return (
          <div
            key={c.id}
            role={selectable ? "radio" : undefined}
            aria-checked={selectable ? on : undefined}
            onClick={selectable ? () => onSelect?.(c.id) : undefined}
            className={`flex items-center gap-3 p-3 rounded-xl border ${on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"} ${selectable ? "cursor-pointer" : ""}`}
          >
            {isBankAccount(c) ? <Landmark className="w-5 h-5 text-primary" /> : <CreditCard className="w-5 h-5 text-primary" />}
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{methodLabel(c)}</p>
              {isBankAccount(c) ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.bank_name ? `${c.bank_name} · ` : ""}Payments take {BANK_CLEARING_TEXT} to clear</p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">Expires {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}{c.is_default ? " · Default" : ""}</p>
              )}
            </div>
            {!selectable && (
              <div className="flex items-center gap-3">
                {!c.is_default && !isBankAccount(c) && <button type="button" onClick={() => makeDefault(c)} className="text-xs text-primary font-semibold">Make default</button>}
                <button type="button" onClick={() => remove(c)} aria-label={isBankAccount(c) ? "Remove bank account" : "Remove card"} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        );
      })}
      {adding === "card" ? (
        <AddCardForm onSaved={(id) => { setAdding(null); onSelect?.(id); load(); }} onCancel={() => setAdding(null)} />
      ) : adding === "bank" ? (
        <AddBankForm onSaved={(id) => { setAdding(null); onSelect?.(id); load(); }} onCancel={() => setAdding(null)} />
      ) : (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-x-5">
            <button type="button" onClick={() => setAdding("card")} className="flex items-center gap-2 text-sm text-primary font-semibold py-1">
              <Plus className="w-4 h-4" /> Add a card
            </button>
            {allowBank && (
              <button type="button" onClick={() => setAdding("bank")} className="flex items-center gap-2 text-sm text-primary font-semibold py-1">
                <Landmark className="w-4 h-4" /> Add a bank account
              </button>
            )}
          </div>
          {allowBank && bankNote && <p className="text-xs text-gray-500 dark:text-gray-400">{bankNote}</p>}
        </div>
      )}
    </div>
  );
}
