import { api } from './api';
import type { Filters } from '../components/SearchFilters';

export type PlanPriority = 'ESSENTIAL' | 'RECOMMENDED' | 'NICE_TO_HAVE';

/** What "Find vendors" turns into a search. */
export interface PlanSearch {
  category_id: string;
  /** yyyy-MM-dd */
  date: string | null;
  near_lat: number | null;
  near_lng: number | null;
  radius_miles: number | null;
  location: string | null;
}

export interface PlanItem {
  category: { id: string; name: string };
  priority: PlanPriority;
  why: string;
  tip: string | null;
  lead_days: number;
  /** yyyy-MM-dd */
  book_by: string | null;
  book_soon: boolean;
  share_percent: number;
  suggested_budget: number | null;
  available_vendors: number;
  search: PlanSearch;
  /** event plans only */
  covered?: boolean;
  covered_by?: 'booking' | 'budget' | 'venue' | null;
}

export interface Plan {
  event_type: string;
  guest_count: number | null;
  budget: number | null;
  date: string | null;
  near: { lat: number; lng: number; label: string | null } | null;
  location: string | null;
  radius_miles: number;
  items: PlanItem[];
  totals: { suggested_budget: number | null };
  event?: { id: string; name: string; status: string; type_set: boolean };
  summary?: { total: number; covered: number };
}

export interface ChecklistRequest {
  event_type: string;
  guest_count?: number;
  budget?: number;
  /** yyyy-MM-dd */
  date?: string;
  location?: string;
  lat?: number;
  lng?: number;
}

/** "Plan your event": suggested services, budget split and vendors available. */
export const PlanningService = {
  checklist: (body: ChecklistRequest) => api.post<{ success: boolean; data: Plan }>('/planning/checklist', body),
  eventPlan: (eventId: string) => api.get<{ success: boolean; data: Plan }>(`/events/${eventId}/plan`),
};

export const PLAN_EVENT_TYPES = [
  { value: 'WEDDING', label: 'Wedding' },
  { value: 'BIRTHDAY', label: 'Birthday' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'CONCERT', label: 'Concert' },
  { value: 'CONFERENCE', label: 'Conference' },
  { value: 'PRIVATE_PARTY', label: 'Private party' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export const PRIORITY_ORDER: PlanPriority[] = ['ESSENTIAL', 'RECOMMENDED', 'NICE_TO_HAVE'];
export const PRIORITY_LABEL: Record<PlanPriority, string> = { ESSENTIAL: 'Essential', RECOMMENDED: 'Recommended', NICE_TO_HAVE: 'Nice to have' };

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** "Jun 12, 2027" from yyyy-MM-dd, without the time zone shifting the day. */
export function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function leadLabel(days: number): string {
  if (days >= 60) return `about ${Math.round(days / 30)} months`;
  if (days >= 14) return `about ${Math.round(days / 7)} weeks`;
  return `${days} days`;
}

export function bookByLabel(item: PlanItem): string {
  if (!item.book_by) return `Usually booked ${leadLabel(item.lead_days)} ahead`;
  return item.book_soon ? `Book soon: most book ${leadLabel(item.lead_days)} ahead` : `Book by ${formatDay(item.book_by)}`;
}

export function availabilityLabel(item: PlanItem): string {
  const n = item.available_vendors;
  const what = n === 0 ? 'No vendors' : n === 1 ? '1 vendor' : `${n} vendors`;
  return `${what} available${item.search.date ? ' that day' : ''}${item.search.near_lat != null ? ' nearby' : ''}`;
}

export function groupByPriority(items: PlanItem[]) {
  return PRIORITY_ORDER.map((priority) => ({ priority, items: items.filter((i) => i.priority === priority) })).filter((g) => g.items.length > 0);
}

/**
 * The SearchResults params for an item: its category with the day and place as filters (and the
 * event, so a booking links to it). With no vendors free, just the category.
 */
export function searchParamsFor(item: PlanItem, eventId?: string) {
  const none = item.available_vendors === 0;
  const filters: Filters = {};
  if (!none && item.search.date) filters.date = item.search.date;
  if (!none && item.search.near_lat != null && item.search.near_lng != null) {
    filters.near_lat = item.search.near_lat;
    filters.near_lng = item.search.near_lng;
    filters.radius_miles = item.search.radius_miles ?? 25;
    filters.sort = 'distance';
  }
  return { categoryId: item.category.id, categoryName: item.category.name, eventId, filters };
}
