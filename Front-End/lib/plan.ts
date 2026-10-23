import type { PlanItem, PlanPriority, PlanSearch } from "@/service/planning/planning.service";

export const EVENT_TYPES = [
  { value: "WEDDING", label: "Wedding" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "CONCERT", label: "Concert" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "PRIVATE_PARTY", label: "Private party" },
  { value: "OTHER", label: "Something else" },
] as const;

export const PRIORITY_ORDER: PlanPriority[] = ["ESSENTIAL", "RECOMMENDED", "NICE_TO_HAVE"];
export const PRIORITY_LABEL: Record<PlanPriority, string> = {
  ESSENTIAL: "Essential",
  RECOMMENDED: "Recommended",
  NICE_TO_HAVE: "Nice to have",
};

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "Jun 12, 2027" from yyyy-MM-dd, without the time zone shifting the day. */
export function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "about 9 months" / "about 3 weeks" for a lead time in days. */
export function leadLabel(days: number): string {
  if (days >= 60) return `about ${Math.round(days / 30)} months`;
  if (days >= 14) return `about ${Math.round(days / 7)} weeks`;
  return `${days} days`;
}

/** "N vendors available" with the date / place it was counted for. */
export function availabilityLabel(item: PlanItem): string {
  const n = item.available_vendors;
  const what = n === 0 ? "No vendors" : n === 1 ? "1 vendor" : `${n} vendors`;
  return `${what} available${item.search.date ? " that day" : ""}${item.search.near_lat != null ? " nearby" : ""}`;
}

/** The marketplace with the item's filters applied (and the event, so a booking links to it). */
export function marketplaceHref(search: PlanSearch, eventId?: string): string {
  const q = new URLSearchParams();
  q.set("category_id", search.category_id);
  if (search.date) q.set("date", search.date);
  if (search.near_lat != null && search.near_lng != null) {
    q.set("near_lat", String(search.near_lat));
    q.set("near_lng", String(search.near_lng));
    if (search.radius_miles) q.set("radius_miles", String(search.radius_miles));
    if (search.location) q.set("near", search.location);
  }
  if (eventId) q.set("event", eventId);
  return `/marketplace?${q.toString()}`;
}

/** Items grouped by priority, in priority order, leaving out empty groups. */
export function groupByPriority(items: PlanItem[]): { priority: PlanPriority; items: PlanItem[] }[] {
  return PRIORITY_ORDER.map((priority) => ({ priority, items: items.filter((i) => i.priority === priority) })).filter((g) => g.items.length > 0);
}
