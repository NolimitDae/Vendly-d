"use client";

import type { AddOn, AddOnInput, AddOnKind, AddOnUnit } from "@/service/add-ons/add-ons.service";
import { ADD_ON_UNITS } from "@/lib/addons";

export const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";
export const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export interface AddOnDraft {
  name: string;
  description: string;
  price: string;
  price_unit: AddOnUnit;
  max_quantity: string;
}

export const emptyDraft = (d: Partial<AddOnDraft> = {}): AddOnDraft => ({
  name: "",
  description: "",
  price: "",
  price_unit: "FIXED",
  max_quantity: "",
  ...d,
});

export const draftFrom = (a: AddOn): AddOnDraft => ({
  name: a.name,
  description: a.description ?? "",
  price: String(a.price),
  price_unit: a.price_unit,
  max_quantity: a.max_quantity ? String(a.max_quantity) : "",
});

/** Checks a draft and turns it into the request body, or returns a message to show. */
export function draftToInput(d: AddOnDraft, kind: AddOnKind): AddOnInput | string {
  const name = d.name.trim();
  if (name.length < 2) return "Give it a name (at least 2 characters).";
  if (name.length > 120) return "Keep the name under 120 characters.";
  if (d.description.length > 500) return "Keep the description under 500 characters.";
  const price = Number(d.price);
  if (d.price === "" || !(price >= 0) || price > 100000) return "Enter a price.";
  let max: number | null = null;
  if (d.price_unit === "PER_ITEM" && d.max_quantity) {
    max = Number(d.max_quantity);
    if (!Number.isInteger(max) || max < 1 || max > 1000) return "The most a customer can pick must be a whole number from 1 to 1000.";
  }
  return {
    kind,
    name,
    description: d.description.trim() || undefined,
    price: Math.round(price * 100) / 100,
    price_unit: d.price_unit,
    ...(d.price_unit === "PER_ITEM" ? { max_quantity: max } : {}),
  };
}

/** Name, description, price, how it's priced, and (for "each") the most a customer can pick. */
export default function AddOnFields({
  draft,
  onChange,
  idPrefix,
  kind,
}: {
  draft: AddOnDraft;
  onChange: (d: AddOnDraft) => void;
  idPrefix: string;
  kind: AddOnKind;
}) {
  const set = (k: keyof AddOnDraft, v: string) => onChange({ ...draft, [k]: v });
  const word = kind === "FEE" ? "fee" : "add-on";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-name`} className={labelCls}>Name</label>
        <input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={120}
          placeholder={kind === "FEE" ? "e.g. Late return" : "e.g. Bartender"}
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-description`} className={labelCls}>Description (optional)</label>
        <textarea
          id={`${idPrefix}-description`}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={kind === "FEE" ? "When this fee applies" : "What the customer gets"}
          className={`${inputCls} resize-none`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-price`} className={labelCls}>Price</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden>$</span>
          <input
            id={`${idPrefix}-price`}
            type="number"
            min="0"
            step="0.01"
            value={draft.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="0.00"
            className={`${inputCls} pl-7`}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-unit`} className={labelCls}>How the {word} is priced</label>
        <select id={`${idPrefix}-unit`} value={draft.price_unit} onChange={(e) => set("price_unit", e.target.value)} className={inputCls}>
          {ADD_ON_UNITS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
      </div>
      {draft.price_unit === "PER_ITEM" && (
        <div>
          <label htmlFor={`${idPrefix}-max`} className={labelCls}>Most a customer can pick (optional)</label>
          <input
            id={`${idPrefix}-max`}
            type="number"
            min="1"
            max="1000"
            step="1"
            value={draft.max_quantity}
            onChange={(e) => set("max_quantity", e.target.value)}
            className={inputCls}
          />
        </div>
      )}
    </div>
  );
}
