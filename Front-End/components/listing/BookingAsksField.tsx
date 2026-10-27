"use client";

import { cn } from "@/lib/utils";
import type { ServiceAt } from "@/lib/booking-tracker";

/** A venue needs a guest count unless the vendor says otherwise (as the API decides). */
export const isVenueCategory = (name?: string | null) => name?.trim().toLowerCase() === "venues";

/**
 * What booking asks the customer for: whether they may come to the vendor instead of giving an address
 * (packages at the customer's place), and whether a guest count is required. The guest count choice is
 * null until the vendor picks one (the default: required for venues only).
 */
export default function BookingAsksField({
  serviceAt,
  customerCanCome,
  onCustomerCanCome,
  guestRequired,
  onGuestRequired,
  isVenue,
  priceUnit,
}: {
  serviceAt: ServiceAt;
  customerCanCome: boolean;
  onCustomerCanCome: (v: boolean) => void;
  guestRequired: boolean | null;
  onGuestRequired: (v: boolean) => void;
  isVenue: boolean;
  priceUnit: string;
}) {
  const required = guestRequired ?? isVenue;
  return (
    <div className="space-y-4">
      {serviceAt === "CUSTOMER_LOCATION" && !isVenue && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={customerCanCome}
            onChange={(e) => onCustomerCanCome(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customers can come to me instead</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              For pickups and drop-offs: customers can tick &ldquo;I&rsquo;ll come to the vendor&rdquo; and skip the service address. They see your business address (set in your profile) once you accept.
            </span>
          </span>
        </label>
      )}
      {priceUnit === "person" ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Priced per person: customers always enter how many guests are coming.</p>
      ) : (
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Guest count</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { value: true, label: "Required" },
              { value: false, label: "Optional" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={required === o.value}
                onClick={() => onGuestRequired(o.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border transition",
                  required === o.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {required ? "Customers must say how many guests are coming to send a request." : "Customers can add a guest count, but don’t have to."}
          </p>
        </fieldset>
      )}
    </div>
  );
}
