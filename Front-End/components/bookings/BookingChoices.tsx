import DosDontsList from "@/components/listing/DosDontsList";
import type { ChosenCustomization } from "@/lib/package-options";
import type { TravelQuote } from "@/lib/travel-fee";

export interface BookingChoicesFields {
  /** what was picked for the package's customizations, frozen when the booking was made */
  customizations?: ChosenCustomization[] | null;
  /** the delivery / travel fee in the price (null: none applies), and how it was worked out */
  travel_fee?: number | null;
  travel?: TravelQuote | null;
  status?: string;
  listing?: { title?: string; dos?: string[] | null; donts?: string[] | null } | null;
  rental_reservations?: { id?: string; item?: { title?: string; dos?: string[] | null; donts?: string[] | null } | null }[] | null;
}

const money = (n: number) => "$" + Number(n).toFixed(2);

/** The travel fee on a booking, for both sides; the vendor is told when it couldn't be worked out. */
export function TravelFeeSection({ booking, forVendor }: { booking: BookingChoicesFields; forVendor?: boolean }) {
  const t = booking.travel;
  if (!t) return null;
  const unpriced = t.status === "UNPRICED" && booking.travel_fee == null;
  return (
    <section aria-labelledby="travel-fee" data-testid="booking-travel-fee">
      <h3 id="travel-fee" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
        {booking.rental_reservations?.length ? "Delivery fee" : "Travel fee"}
      </h3>
      {unpriced ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {forVendor
            ? booking.status === "PENDING"
              ? "We couldn't place the customer's address on the map, so no travel fee was added. If you charge one, add it with Suggest changes before you accept."
              : "We couldn't place the customer's address on the map, so no travel fee was added."
            : "We couldn't place your address on the map, so no travel fee was added. The vendor may suggest one before they accept, and you approve it first."}
        </p>
      ) : (
        <div className="flex justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
          <span>{t.label}</span>
          <span className="whitespace-nowrap">{money(booking.travel_fee ?? t.fee ?? 0)}</span>
        </div>
      )}
    </section>
  );
}

/** The customizations chosen for a booking, its travel fee, and the vendor's dos and don'ts for the package or rented items. */
export default function BookingChoices({ booking, forVendor }: { booking: BookingChoicesFields; forVendor?: boolean }) {
  const chosen = booking.customizations ?? [];
  const items = (booking.rental_reservations ?? []).map((r) => r.item).filter((i) => !!i && (i.dos?.length || i.donts?.length));
  const pkg = booking.listing && (booking.listing.dos?.length || booking.listing.donts?.length) ? booking.listing : null;
  if (!chosen.length && !items.length && !pkg && !booking.travel) return null;
  return (
    <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
      <TravelFeeSection booking={booking} forVendor={forVendor} />
      {!!chosen.length && (
        <section aria-labelledby="chosen-customizations">
          <h3 id="chosen-customizations" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Customizations
          </h3>
          <ul className="space-y-1.5 text-sm">
            {chosen.map((g) => (
              <li key={g.group_id} className="flex justify-between gap-3">
                <span className="text-gray-700 dark:text-gray-300">
                  <span className="text-gray-500 dark:text-gray-400">{g.title}:</span> {g.options.map((o) => o.label).join(", ")}
                </span>
                {g.amount > 0 && <span className="text-gray-700 dark:text-gray-300 whitespace-nowrap">+{money(g.amount)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {pkg && <DosDontsList dos={pkg.dos} donts={pkg.donts} />}
      {items.map((i, k) => (
        <DosDontsList key={k} dos={i!.dos} donts={i!.donts} title={items.length > 1 ? `Dos and don'ts: ${i!.title}` : "Dos and don'ts"} />
      ))}
    </div>
  );
}
