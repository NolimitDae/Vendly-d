"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { MoneyService, type Promo } from "@/service/admin/money.service";

const field = "h-10 px-4 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white";
const empty = { code: "", description: "", kind: "percent" as "percent" | "amount", value: "", min_amount: "", max_uses: "", expires_at: "", once_per_customer: false, first_booking_only: false };

const limits = [
  { key: "once_per_customer", label: "Once per customer" },
  { key: "first_booking_only", label: "First booking only" },
] as const;

export default function PromosPageContent() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await MoneyService.promos();
      setPromos(res.data?.data ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await MoneyService.createPromo({
        code: form.code,
        description: form.description || undefined,
        percent_off: form.kind === "percent" ? Number(form.value) : null,
        amount_off: form.kind === "amount" ? Number(form.value) : null,
        min_amount: form.min_amount ? Number(form.min_amount) : null,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_at: form.expires_at || null,
        once_per_customer: form.once_per_customer,
        first_booking_only: form.first_booking_only,
      });
      toast.success("Promo code created");
      setForm(empty);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't create code");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: Promo) => {
    try {
      if (p.active) await MoneyService.deactivatePromo(p.id);
      else await MoneyService.updatePromo(p.id, { active: true });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't update code");
    }
  };

  const setLimit = async (p: Promo, key: (typeof limits)[number]["key"], on: boolean) => {
    try {
      await MoneyService.updatePromo(p.id, { [key]: on });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Couldn't update code");
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">New promo code</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input aria-label="Code" required placeholder="CODE e.g. GLAM20" className={field} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <div className="flex gap-2">
            <select aria-label="Discount type" className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "amount" })}>
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
            <input aria-label="Discount" required placeholder={form.kind === "percent" ? "10" : "20"} inputMode="decimal" className={`${field} w-full`} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/[^0-9.]/g, "") })} />
          </div>
          <input aria-label="Description" placeholder="Description (optional)" className={field} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input aria-label="Minimum booking" placeholder="Minimum booking $ (optional)" inputMode="decimal" className={field} value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value.replace(/[^0-9.]/g, "") })} />
          <input aria-label="Max uses" placeholder="Max uses (optional)" inputMode="numeric" className={field} value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value.replace(/\D/g, "") })} />
          <input aria-label="Expires" type="date" className={field} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {limits.map((l) => (
            <label key={l.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" className="accent-primary w-4 h-4" checked={form[l.key]} onChange={(e) => setForm({ ...form, [l.key]: e.target.checked })} />
              {l.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">First booking only: for customers with no other booking or open request yet. Declined, expired and unpaid cancelled requests don’t use up a once-per-customer code.</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Discounts come off the vendor’s price; Vendly absorbs nothing, so agree promos with vendors first.</p>
        <button disabled={saving} className="px-5 h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">Create code</button>
      </form>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : (
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Discount</th>
                <th className="px-4 py-2">Used</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2">Limits</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {promos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No promo codes yet.</td>
                </tr>
              )}
              {promos.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2 font-mono text-gray-900 dark:text-white">
                    {p.code}
                    {p.description && <span className="block text-xs font-sans text-gray-500">{p.description}</span>}
                  </td>
                  <td className="px-4 py-2">{p.percent_off != null ? `${Number(p.percent_off)}%` : `$${Number(p.amount_off).toFixed(2)}`}</td>
                  <td className="px-4 py-2">{p.uses}{p.max_uses != null ? ` / ${p.max_uses}` : ""}</td>
                  <td className="px-4 py-2">{p.expires_at ? dayjs(p.expires_at).format("MMM D, YYYY") : "Never"}</td>
                  <td className="px-4 py-2">
                    {limits.map((l) => (
                      <label key={l.key} className="flex items-center gap-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">
                        <input type="checkbox" className="accent-primary" aria-label={`${l.label} for ${p.code}`} checked={!!p[l.key]} onChange={(e) => setLimit(p, l.key, e.target.checked)} />
                        {l.label}
                      </label>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => toggle(p)} className={`text-xs font-semibold ${p.active ? "text-red-500" : "text-primary"}`}>{p.active ? "Deactivate" : "Reactivate"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
