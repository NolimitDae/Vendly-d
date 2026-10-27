"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { MoneyService, type CategoryFee, type Flag, type PlatformSetting } from "@/service/admin/money.service";

const input =
  "w-full h-11 px-4 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";
const err = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/** Platform fees (stored in the database), per-category fee overrides and feature flags. */
export default function FeeSettings() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<CategoryFee[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [newFlag, setNewFlag] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [s, f] = await Promise.all([MoneyService.settings(), MoneyService.flags()]);
      const data = s.data?.data;
      setSettings(data?.settings ?? []);
      setValues(Object.fromEntries((data?.settings ?? []).map((x: PlatformSetting) => [x.key, x.value ?? ""])));
      setCategories(data?.categories ?? []);
      setFlags(f.data?.data ?? []);
    } catch (e) {
      toast.error(err(e, "Couldn't load settings"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await MoneyService.updateSettings(values);
      toast.success("Settings saved");
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't save settings"));
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async (c: CategoryFee, raw: string) => {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v != null && (Number.isNaN(v) || v < 0 || v > 50)) return toast.error("Use a number between 0 and 50");
    try {
      await MoneyService.setCategoryFee(c.id, v);
      toast.success(`${c.name}: ${v == null ? "uses the platform fee" : `${v}%`}`);
    } catch (e) {
      toast.error(err(e, "Couldn't save"));
    }
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    try {
      await MoneyService.setFlag(key, enabled);
      setFlags((prev) => (prev.some((f) => f.key === key) ? prev.map((f) => (f.key === key ? { ...f, enabled } : f)) : [...prev, { key, enabled }]));
    } catch (e) {
      toast.error(err(e, "Couldn't update flag"));
    }
  };

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Fees and limits</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {settings.map((s) => (
            <label key={s.key} className="space-y-1.5">
              <span className="block text-sm text-gray-600 dark:text-gray-300">{s.label}</span>
              <input
                aria-label={s.label}
                className={input}
                value={values[s.key] ?? ""}
                inputMode={s.kind === "text" ? "text" : "decimal"}
                onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The Vendly Protection fee is added to the customer’s price on new bookings, never more than the maximum (leave it empty for no cap; category fees are capped too). Vendor commission is taken from the vendor’s payout when a booking is released. Existing bookings keep the fee they were created with.
          Bookings whose total is at or above the large booking amount get 48 hours instead of 12 to fix a failed deposit or balance, and can be paid from a bank account.
        </p>
        <button onClick={save} disabled={saving} className="px-6 h-11 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-60 flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save settings
        </button>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Fee by category</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">Leave blank to use the platform fee. Changes apply when you leave the field.</p>
        <div className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-100 dark:border-gray-700">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-gray-900 dark:text-white">{c.name}</span>
              <div className="flex items-center gap-2 w-32">
                <input
                  aria-label={`${c.name} fee percent`}
                  defaultValue={c.fee_percent ?? ""}
                  placeholder="Platform"
                  inputMode="decimal"
                  onBlur={(e) => e.target.value !== String(c.fee_percent ?? "") && saveCategory(c, e.target.value)}
                  className="w-full h-9 px-3 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Feature flags</h3>
        <div className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-100 dark:border-gray-700">
          {flags.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">No flags yet.</p>}
          {flags.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-mono text-gray-900 dark:text-white">{f.key}</p>
                {f.description && <p className="text-xs text-gray-500">{f.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={`Toggle ${f.key}`}
                  onClick={() => toggleFlag(f.key, !f.enabled)}
                  className={`w-11 h-6 rounded-full relative transition ${f.enabled ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${f.enabled ? "left-5" : "left-0.5"}`} />
                </button>
                <button aria-label={`Delete ${f.key}`} onClick={() => MoneyService.deleteFlag(f.key).then(() => setFlags((p) => p.filter((x) => x.key !== f.key)))} className="text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={input} placeholder="new_flag_key" value={newFlag} onChange={(e) => setNewFlag(e.target.value.toLowerCase())} aria-label="New flag key" />
          <button
            onClick={() => newFlag.trim() && toggleFlag(newFlag.trim(), false).then(() => setNewFlag(""))}
            className="px-4 h-11 rounded-full border border-gray-200 dark:border-gray-700 text-sm flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add flag
          </button>
        </div>
      </section>
    </div>
  );
}
