import { api } from './api';

export type EventStatus = 'PLANNING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type EventType =
  | 'WEDDING'
  | 'BIRTHDAY'
  | 'CORPORATE'
  | 'CONCERT'
  | 'CONFERENCE'
  | 'PRIVATE_PARTY'
  | 'OTHER';

export interface Event {
  id: string;
  name: string;
  type?: EventType;
  date?: string;
  venue?: string;
  guest_count?: number;
  total_budget?: number;
  status: EventStatus;
  notes?: string;
  created_at: string;
  _count?: { bookings: number; tasks: number; budget_items: number };
}

export interface EventBooking {
  id: string;
  booking: {
    id: string;
    status: string;
    amount?: number;
    vendor: { id: string; name: string; avatar?: string };
    listing: { id: string; title: string; price: number; images: string[] };
  };
}

export interface BudgetItem {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  note?: string;
}

export interface EventTask {
  id: string;
  title: string;
  due_date?: string;
  completed: boolean;
}

export interface EventDetail extends Event {
  bookings: EventBooking[];
  budget_items: BudgetItem[];
  tasks: EventTask[];
}

export interface BudgetSummary {
  items: BudgetItem[];
  total_allocated: number;
  total_spent: number;
  remaining: number;
}

const qs = (params: Record<string, any>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v != null && q.set(k, String(v)));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const EventsService = {
  list: (params?: { page?: number; limit?: number; status?: EventStatus }) =>
    api.get<{ success: boolean; data: Event[]; meta: any }>(`/events${qs(params ?? {})}`),

  create: (data: {
    name: string;
    type?: EventType;
    date?: string;
    venue?: string;
    guest_count?: number;
    total_budget?: number;
    notes?: string;
  }) => api.post<{ success: boolean; data: Event }>('/events', data),

  findOne: (id: string) =>
    api.get<{ success: boolean; data: EventDetail }>(`/events/${id}`),

  update: (id: string, data: Partial<{
    name: string;
    type: EventType;
    date: string;
    venue: string;
    guest_count: number;
    total_budget: number;
    status: EventStatus;
    notes: string;
  }>) => api.patch<{ success: boolean; data: Event }>(`/events/${id}`, data),

  cancel: (id: string) =>
    api.delete<{ success: boolean; data: Event }>(`/events/${id}`),

  linkBooking: (eventId: string, bookingId: string) =>
    api.post(`/events/${eventId}/bookings`, { booking_id: bookingId }),

  getBudget: (eventId: string) =>
    api.get<{ success: boolean; data: BudgetSummary }>(`/events/${eventId}/budget`),

  addBudgetItem: (eventId: string, data: { category: string; allocated: number; spent?: number; note?: string }) =>
    api.post<{ success: boolean; data: BudgetItem }>(`/events/${eventId}/budget`, data),

  addTask: (eventId: string, data: { title: string; due_date?: string }) =>
    api.post<{ success: boolean; data: EventTask }>(`/events/${eventId}/tasks`, data),

  updateTask: (eventId: string, taskId: string, data: { title?: string; due_date?: string; completed?: boolean }) =>
    api.patch<{ success: boolean; data: EventTask }>(`/events/${eventId}/tasks/${taskId}`, data),
};
