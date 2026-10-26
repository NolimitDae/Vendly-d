"use client";

import { cn } from "@/lib/utils";
import type { ServiceAt } from "@/lib/booking-tracker";

const OPTIONS: { value: ServiceAt; label: string }[] = [
  { value: "CUSTOMER_LOCATION", label: "At the customer's place" },
  { value: "VENDOR_LOCATION", label: "Customers come to me" },
];

/** Where a package happens: the vendor goes to the customer, or the customer comes to the vendor's business address. */
export default function ServiceAtField({ value, onChange }: { value: ServiceAt; onChange: (v: ServiceAt) => void }) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Where does it happen?</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm border transition",
              value === o.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        {value === "VENDOR_LOCATION"
          ? "Customers see your business address (set in your profile) once you accept their booking. Before that they only see the location above."
          : "You go to the address the customer gives when they book. You get directions on the booking."}
      </p>
    </fieldset>
  );
}
