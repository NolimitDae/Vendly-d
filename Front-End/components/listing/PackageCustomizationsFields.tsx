"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { perUnit } from "@/lib/addons";
import {
  MAX_GROUP_TITLE,
  MAX_OPTION_GROUPS,
  MAX_OPTION_LABEL,
  MAX_OPTIONS_PER_GROUP,
  draftsToInput,
  move,
  newCustomization,
  newOption,
  type CustomizationDraft,
  type OptionDraft,
} from "@/lib/package-options";

export interface PackageCustomizationsValue {
  drafts: CustomizationDraft[];
  /** edit form: true once the saved ones have loaded (nothing is saved before that) */
  loaded: boolean;
}

export const emptyCustomizations = (loaded = true): PackageCustomizationsValue => ({ drafts: [], loaded });

/**
 * After the package is saved: replaces its customizations. A new package with none skips the call;
 * an edit form only saves once its list has loaded.
 */
export async function saveCustomizations(listingId: string, v: PackageCustomizationsValue, priceUnit: string, editing: boolean) {
  if (!v.loaded) return;
  if (!editing && !v.drafts.length) return;
  await VendorListingService.setCustomizations(listingId, draftsToInput(v.drafts, !!perUnit(priceUnit)));
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm";
const iconBtn = "p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * Package form section: "Add customization" makes a dropdown customers answer when booking (a braider's
 * "Style": Knotless, Miracle knots…), pick one or pick up to N, optional or required, each option with an
 * optional upcharge (once, or per person / hour / day on packages priced that way).
 */
export default function PackageCustomizationsFields({
  value,
  onChange,
  priceUnit,
}: {
  value: PackageCustomizationsValue;
  onChange: (v: PackageCustomizationsValue) => void;
  priceUnit: string;
}) {
  const unit = perUnit(priceUnit);
  const groups = value.drafts;
  const setGroups = (drafts: CustomizationDraft[]) => onChange({ ...value, drafts });
  const setGroup = (i: number, patch: Partial<CustomizationDraft>) => setGroups(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const setOption = (i: number, j: number, patch: Partial<OptionDraft>) =>
    setGroup(i, { options: groups[i].options.map((o, idx) => (idx === j ? { ...o, ...patch } : o)) });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">Customizations</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Dropdowns customers answer when they book, for example &quot;Style&quot; with Knotless or Miracle knots. Add an upcharge to any option.
        </p>
      </div>

      {groups.map((g, i) => {
        const name = g.title.trim() || `Customization ${i + 1}`;
        return (
          <fieldset key={g.key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <legend className="sr-only">{name}</legend>
            <div className="flex items-center gap-2">
              <input
                aria-label={`Title of customization ${i + 1}`}
                value={g.title}
                maxLength={MAX_GROUP_TITLE}
                placeholder="Title, e.g. Style"
                onChange={(e) => setGroup(i, { title: e.target.value })}
                className={inputCls}
              />
              <button type="button" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => setGroups(move(groups, i, -1))} className={iconBtn}>
                <ArrowUp className="w-4 h-4" />
              </button>
              <button type="button" aria-label={`Move ${name} down`} disabled={i === groups.length - 1} onClick={() => setGroups(move(groups, i, 1))} className={iconBtn}>
                <ArrowDown className="w-4 h-4" />
              </button>
              <button type="button" aria-label={`Remove ${name}`} onClick={() => setGroups(groups.filter((_, idx) => idx !== i))} className={`${iconBtn} hover:text-red-500`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select
                aria-label={`How customers choose for ${name}`}
                value={g.multi ? "multi" : "one"}
                onChange={(e) => setGroup(i, { multi: e.target.value === "multi" })}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="one">Pick one</option>
                <option value="multi">Pick up to…</option>
              </select>
              {g.multi && (
                <input
                  aria-label={`Most options customers can pick for ${name}`}
                  type="number"
                  min={2}
                  max={Math.max(2, g.options.length)}
                  step={1}
                  value={g.max}
                  onChange={(e) => setGroup(i, { max: e.target.value })}
                  className="w-20 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              )}
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={g.required} onChange={(e) => setGroup(i, { required: e.target.checked })} className="w-4 h-4 accent-primary" />
                Required
              </label>
            </div>

            <div className="space-y-2">
              {g.options.map((o, j) => (
                <div key={o.key} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    aria-label={`Option ${j + 1} of ${name}`}
                    value={o.label}
                    maxLength={MAX_OPTION_LABEL}
                    placeholder={j === 0 ? "e.g. Knotless" : "Option"}
                    onChange={(e) => setOption(i, j, { label: e.target.value })}
                    className={inputCls}
                  />
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">+$</span>
                    <input
                      aria-label={`Upcharge for option ${j + 1} of ${name}`}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      value={o.price}
                      onChange={(e) => setOption(i, j, { price: e.target.value })}
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                  {unit && (
                    <select
                      aria-label={`How the upcharge for option ${j + 1} of ${name} is counted`}
                      value={o.price_mode}
                      onChange={(e) => setOption(i, j, { price_mode: e.target.value as OptionDraft["price_mode"] })}
                      className="w-32 shrink-0 px-2 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="FLAT">Once</option>
                      <option value="PER_UNIT">Per {unit}</option>
                    </select>
                  )}
                  <button type="button" aria-label={`Move option ${j + 1} of ${name} up`} disabled={j === 0} onClick={() => setGroup(i, { options: move(g.options, j, -1) })} className={iconBtn}>
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move option ${j + 1} of ${name} down`}
                    disabled={j === g.options.length - 1}
                    onClick={() => setGroup(i, { options: move(g.options, j, 1) })}
                    className={iconBtn}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove option ${j + 1} of ${name}`}
                    onClick={() => setGroup(i, { options: g.options.filter((_, idx) => idx !== j) })}
                    className={`${iconBtn} hover:text-red-500`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {g.options.length < MAX_OPTIONS_PER_GROUP && (
                <button type="button" onClick={() => setGroup(i, { options: [...g.options, newOption()] })} className="flex items-center gap-1 text-sm font-medium text-primary">
                  <Plus className="w-4 h-4" /> Add an option
                </button>
              )}
            </div>
          </fieldset>
        );
      })}

      {groups.length < MAX_OPTION_GROUPS && (
        <button
          type="button"
          onClick={() => setGroups([...groups, newCustomization()])}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-primary text-primary text-sm font-medium hover:bg-primary/5"
        >
          <Plus className="w-4 h-4" /> Add customization
        </button>
      )}
    </div>
  );
}
