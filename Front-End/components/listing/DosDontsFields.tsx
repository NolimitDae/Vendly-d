"use client";

import { Plus, X } from "lucide-react";
import { MAX_DOS, MAX_DO_LENGTH, type DosDonts } from "@/lib/package-options";

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";

function LineList({ label, one, items, onChange }: { label: string; one: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</h3>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input aria-label={`${one} ${i + 1}`} value={item} maxLength={MAX_DO_LENGTH} onChange={(e) => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))} className={inputCls} />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label={`Remove ${one.toLowerCase()} ${i + 1}`}
            className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      {items.length < MAX_DOS && (
        <button type="button" onClick={() => onChange([...items, ""])} className="flex items-center gap-1 text-sm font-medium text-primary">
          <Plus className="w-4 h-4" /> Add a {one.toLowerCase()}
        </button>
      )}
    </div>
  );
}

/** Dos and don'ts for a package or rental item: special instructions for using the equipment. */
export default function DosDontsFields({ value, onChange, plain }: { value: DosDonts; onChange: (v: DosDonts) => void; /** inside another form card */ plain?: boolean }) {
  return (
    <div className={plain ? "space-y-4" : "bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4"}>
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">Dos and don&apos;ts</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Special instructions for using your equipment, one short line each. Customers see them before they book and on their booking.
        </p>
      </div>
      <LineList label="Dos" one="Do" items={value.dos} onChange={(dos) => onChange({ ...value, dos })} />
      <LineList label="Don'ts" one="Don't" items={value.donts} onChange={(donts) => onChange({ ...value, donts })} />
    </div>
  );
}
