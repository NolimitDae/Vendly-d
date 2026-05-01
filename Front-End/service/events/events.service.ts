import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

const jsonHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
    "Content-Type": "application/json",
  },
});

export const EventsService = {
  list: async (params?: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null) query.set(k, String(v));
      });
    }
    return Fetch.get(`/events?${query.toString()}`, authHeaders());
  },

  create: async (data: {
    name: string;
    type?: string;
    date?: string;
    venue?: string;
    guest_count?: number;
    total_budget?: number;
    notes?: string;
  }) => Fetch.post("/events", data, jsonHeaders()),

  getOne: async (id: string) => Fetch.get(`/events/${id}`, authHeaders()),

  update: async (
    id: string,
    data: Partial<{
      name: string;
      type: string;
      date: string;
      venue: string;
      guest_count: number;
      total_budget: number;
      notes: string;
      status: string;
    }>,
  ) => Fetch.patch(`/events/${id}`, data, jsonHeaders()),

  cancel: async (id: string) => Fetch.delete(`/events/${id}`, authHeaders()),

  linkBooking: async (eventId: string, booking_id: string) =>
    Fetch.post(`/events/${eventId}/bookings`, { booking_id }, jsonHeaders()),

  getBudget: async (eventId: string) =>
    Fetch.get(`/events/${eventId}/budget`, authHeaders()),

  addBudgetItem: async (
    eventId: string,
    data: { category: string; allocated: number; spent?: number; note?: string },
  ) => Fetch.post(`/events/${eventId}/budget`, data, jsonHeaders()),

  createTask: async (eventId: string, data: { title: string; due_date?: string }) =>
    Fetch.post(`/events/${eventId}/tasks`, data, jsonHeaders()),

  updateTask: async (
    eventId: string,
    taskId: string,
    data: { completed?: boolean; title?: string; due_date?: string },
  ) => Fetch.patch(`/events/${eventId}/tasks/${taskId}`, data, jsonHeaders()),
};
