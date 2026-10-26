import { cn } from "@/lib/utils";

/** Marks a test vendor's package or shop (Admin → Settings → Test vendors): bookings with them aren't real. */
export default function TestBadge({ className }: { className?: string }) {
  return (
    <span
      title="A test vendor for trying Vendly. Bookings with it aren't real."
      className={cn(
        "inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      Test
    </span>
  );
}
