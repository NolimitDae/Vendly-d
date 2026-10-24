"use client";

import { Plus, X } from "lucide-react";
import { MAX_INCLUDED_ITEMS, MAX_INCLUDED_ITEM_LENGTH, MAX_MIN_NOTICE_HOURS } from "@/lib/package-details";

export interface PackageDetails {
  items: string[];
  notice: string;
  noticeUnit: "hours" | "days";
}

export const emptyPackageDetails = (): PackageDetails => ({ items: [], notice: "", noticeUnit: "days" });

/** Form values from a saved package (whole days show as days). */
export function packageDetailsFrom(l: { included_items?: string[] | null; min_notice_hours?: number | null }): PackageDetails {
  const h = l.min_notice_hours ?? 0;
  const days = h >= 24 && h % 24 === 0;
  return {
    items: l.included_items ?? [],
    notice: h ? String(days ? h / 24 : h) : "",
    noticeUnit: days || !h ? "days" : "hours",
  };
}

const cleanItems = (d: PackageDetails) => d.items.map((i) => i.trim()).filter(Boolean);
const noticeHours = (d: PackageDetails) => (d.notice ? Number(d.notice) * (d.noticeUnit === "days" ? 24 : 1) : 0);

/** Checks the details; returns a message to show, or null. */
export function packageDetailsError(d: PackageDetails) {
  const items = cleanItems(d);
  if (items.length > MAX_INCLUDED_ITEMS) return `Add up to ${MAX_INCLUDED_ITEMS} included items.`;
  if (items.some((i) => i.length > MAX_INCLUDED_ITEM_LENGTH)) return `Each included item can be up to ${MAX_INCLUDED_ITEM_LENGTH} characters.`;
  const h = noticeHours(d);
  if (!Number.isInteger(h) || h < 0) return "Minimum notice must be a whole number.";
  if (h > MAX_MIN_NOTICE_HOURS) return "Minimum notice can be up to 90 days.";
  return null;
}

/**
 * Adds included_items / min_notice_hours to the listing form data.
 * `clear` (edit form) sends empty values so the server removes old ones.
 */
export function appendPackageDetails(fd: FormData, d: PackageDetails, clear: boolean) {
  const items = cleanItems(d);
  if (items.length || clear) fd.append("included_items", JSON.stringify(items));
  const h = noticeHours(d);
  if (h || clear) fd.append("min_notice_hours", h ? String(h) : "");
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";

/** "What's included" list and "Book at least N days ahead" for the package form. */
export default function PackageDetailsFields({ value, onChange }: { value: PackageDetails; onChange: (d: PackageDetails) => void }) {
  const setItem = (i: number, text: string) => onChange({ ...value, items: value.items.map((x, idx) => (idx === i ? text : x)) });
  const removeItem = (i: number) => onChange({ ...value, items: value.items.filter((_, idx) => idx !== i) });
  const addItem = () => onChange({ ...value, items: [...value.items, ""] });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">What&apos;s included</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">One short line each, for example &quot;8 hours of coverage&quot;. Shown as a list on your package.</p>
      </div>
      <div className="space-y-2">
        {value.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Included item ${i + 1}`}
              value={item}
              maxLength={MAX_INCLUDED_ITEM_LENGTH}
              onChange={(e) => setItem(i, e.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              aria-label={`Remove included item ${i + 1}`}
              className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {value.items.length < MAX_INCLUDED_ITEMS && (
          <button type="button" onClick={addItem} className="flex items-center gap-1 text-sm font-medium text-primary">
            <Plus className="w-4 h-4" /> Add an item
          </button>
        )}
      </div>

      <div>
        <label htmlFor="min-notice" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Minimum notice (optional)
        </label>
        <div className="flex gap-2">
          <input
            id="min-notice"
            type="number"
            min="0"
            step="1"
            value={value.notice}
            onChange={(e) => onChange({ ...value, notice: e.target.value })}
            className={inputCls}
          />
          <select
            aria-label="Minimum notice unit"
            value={value.noticeUnit}
            onChange={(e) => onChange({ ...value, noticeUnit: e.target.value as PackageDetails["noticeUnit"] })}
            className="w-32 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-gray-900 dark:text-white"
          >
            <option value="days">Days</option>
            <option value="hours">Hours</option>
          </select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Customers can&apos;t request dates sooner than this. Leave blank to allow any date.</p>
      </div>
    </div>
  );
}
