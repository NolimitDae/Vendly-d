"use client";

import { Phone } from "lucide-react";
import MessageButton from "@/components/chat/MessageButton";
import { telLink } from "@/lib/booking-tracker";

/**
 * The other side of a booking with Message and, once the booking is accepted and they've added a number,
 * Call. The API only sends the number while it may be shown.
 */
export default function BookingContact({
  person,
  role,
  phone,
}: {
  person: { id: string; name: string; avatar_url?: string | null };
  /** what they are to the viewer */
  role: "Vendor" | "Customer";
  phone?: string | null;
}) {
  const first = person.name?.split(" ")[0] || role;
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4" aria-label={`${role}: ${person.name}`}>
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg font-semibold text-gray-600 dark:text-gray-200">
          {person.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar from the API's storage
            <img src={person.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            person.name?.[0]?.toUpperCase()
          )}
        </span>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{person.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{role}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <MessageButton userId={person.id} name={person.name} className="flex-1" />
        {!!phone && (
          <a
            href={telLink(phone)}
            aria-label={`Call ${person.name} on ${phone}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <Phone className="w-4 h-4" />
            Call {first}
          </a>
        )}
      </div>
    </section>
  );
}
