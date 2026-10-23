import Link from "next/link";
import { AlarmClock, CalendarClock, Lightbulb, Search, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { availabilityLabel, formatDay, groupByPriority, leadLabel, marketplaceHref, money, PRIORITY_LABEL } from "@/lib/plan";
import type { Plan, PlanItem } from "@/service/planning/planning.service";

/** "Book by Jun 12, 2027", or "Book soon" once inside the usual lead time. */
export function BookBy({ item }: { item: PlanItem }) {
  if (!item.book_by) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
        Usually booked {leadLabel(item.lead_days)} ahead
      </span>
    );
  }
  return item.book_soon ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-xs font-semibold">
      <AlarmClock className="w-3.5 h-3.5" aria-hidden="true" />
      Book soon: most book {leadLabel(item.lead_days)} ahead
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
      <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
      Book by {formatDay(item.book_by)}
    </span>
  );
}

/** "Find vendors" with the item's filters; with none free, a plain browse of the category instead. */
export function FindVendorsLink({ item, eventId, className }: { item: PlanItem; eventId?: string; className?: string }) {
  const none = item.available_vendors === 0;
  const search = none ? { ...item.search, date: null, near_lat: null, near_lng: null } : item.search;
  return (
    <Link
      href={marketplaceHref(search, eventId)}
      aria-label={`${none ? "Browse all" : "Find vendors"}: ${item.category.name}`}
      className={cn(
        "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition",
        none
          ? "border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      <Search className="w-4 h-4" aria-hidden="true" />
      {none ? "Browse all" : "Find vendors"}
    </Link>
  );
}

function ItemCard({ item }: { item: PlanItem }) {
  return (
    <li className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h4 className="font-semibold text-gray-900 dark:text-white">{item.category.name}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300">{item.why}</p>
          {item.tip && (
            <p className="flex items-start gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" aria-hidden="true" />
              {item.tip}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
            <BookBy item={item} />
            <span className={cn("inline-flex items-center gap-1 text-xs", item.available_vendors ? "text-gray-600 dark:text-gray-300" : "text-gray-400")}>
              <Store className="w-3.5 h-3.5" aria-hidden="true" />
              {availabilityLabel(item)}
            </span>
          </div>
        </div>
        <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
          {item.suggested_budget != null ? (
            <p className="text-right">
              <span className="block text-lg font-bold text-gray-900 dark:text-white">{money(item.suggested_budget)}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">{item.share_percent}% of budget</span>
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">About {item.share_percent}% of a budget</p>
          )}
          <FindVendorsLink item={item} />
        </div>
      </div>
    </li>
  );
}

/** The checklist grouped by priority, with budget per item, book-by dates and vendors available. */
export default function PlanResults({ plan }: { plan: Plan }) {
  if (plan.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
        <p className="font-medium text-gray-900 dark:text-white">No suggestions for this event yet</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">You can still browse every service on Vendly.</p>
        <Link href="/marketplace" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
          Browse the marketplace
        </Link>
      </div>
    );
  }
  const noVendors = plan.items.every((i) => i.available_vendors === 0);
  return (
    <div className="space-y-8">
      {noVendors && (
        <p role="status" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-gray-700 dark:text-gray-200">
          {`No vendors are listed for these services${plan.date ? " on that date" : ""}${plan.near ? " near there" : ""} yet. Vendly is growing, so the checklist still works and you can browse what's on offer.`}
        </p>
      )}
      {groupByPriority(plan.items).map((group) => (
        <section key={group.priority} aria-labelledby={`plan-${group.priority}`}>
          <h3 id={`plan-${group.priority}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {PRIORITY_LABEL[group.priority]} ({group.items.length})
          </h3>
          <ul className="space-y-3">
            {group.items.map((item) => (
              <ItemCard key={item.category.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
