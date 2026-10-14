"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { PaymentsService, type SavedCard } from "@/service/payments/payments.service";

export const cardBrand = (b?: string) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : "Card");

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
 * it manages cards (settings).
 */
export default function SavedCards({ selected, onSelect }: { selected?: string | null; onSelect?: (id: string | null) => void }) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const selectable = !!onSelect;

  const load = useCallback(async () => {
    try {
      const res = await PaymentsService.cards();
      const list: SavedCard[] = res.data?.data ?? [];
      setCards(list);
      if (selectable && !selected) onSelect?.((list.find((c) => c.is_default) ?? list[0])?.id ?? null);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (c: SavedCard) => {
    if (!confirm(`Remove ${cardBrand(c.brand)} ending ${c.last4}?`)) return;
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
            <CreditCard className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{cardBrand(c.brand)} •••• {c.last4}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Expires {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}{c.is_default ? " · Default" : ""}</p>
            </div>
            {!selectable && (
              <div className="flex items-center gap-3">
                {!c.is_default && <button type="button" onClick={() => makeDefault(c)} className="text-xs text-primary font-semibold">Make default</button>}
                <button type="button" onClick={() => remove(c)} aria-label="Remove card" className="text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        );
      })}
      {adding ? (
        <AddCardForm onSaved={(id) => { setAdding(false); onSelect?.(id); load(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 text-sm text-primary font-semibold py-1">
          <Plus className="w-4 h-4" /> Add a card
        </button>
      )}
    </div>
  );
}
