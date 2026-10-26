import { Check, X } from "lucide-react";

/** The vendor's dos and don'ts for using the equipment, as customers read them. Renders nothing when empty. */
export default function DosDontsList({ dos, donts, title = "Dos and don'ts" }: { dos?: string[] | null; donts?: string[] | null; title?: string }) {
  if (!dos?.length && !donts?.length) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {!!dos?.length && (
        <ul className="space-y-1.5" aria-label="Dos">
          {dos.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="sr-only">Do: </span>
                {d}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!!donts?.length && (
        <ul className="space-y-1.5" aria-label="Don'ts">
          {donts.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="sr-only">Don&apos;t: </span>
                {d}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
