import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const json = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
    "Content-Type": "application/json",
  },
});

export interface PlatformSetting {
  key: string;
  label: string;
  kind: "percent" | "money" | "text";
  value: string;
}

export interface CategoryFee {
  id: string;
  name: string;
  fee_percent: number | null;
  default_payment_plan: string | null;
}

export interface Dispute {
  id: string;
  status: string;
  amount: number | string;
  service_fee: number | string;
  dispute_opened_at: string;
  dispute_reason: string;
  /** the vendor's side, if they've replied */
  dispute_vendor_reply?: string | null;
  dispute_vendor_replied_at?: string | null;
  dispute_resolved_at?: string | null;
  dispute_resolution?: string | null;
  completed_at?: string | null;
  listing?: { title: string } | null;
  customer: { id: string; name: string; email: string };
  vendor: { id: string; name: string; email: string };
  paid: number;
  has_proof: boolean;
}

export interface Promo {
  id: string;
  code: string;
  description?: string | null;
  percent_off?: string | number | null;
  amount_off?: string | number | null;
  min_amount?: string | number | null;
  max_uses?: number | null;
  uses: number;
  expires_at?: string | null;
  active: boolean;
}

export interface Flag {
  key: string;
  enabled: boolean;
  description?: string | null;
}

export interface RevenueDay {
  date: string;
  collected: number;
  fees: number;
  refunds: number;
  payouts: number;
  commission: number;
}

export const MoneyService = {
  settings: () => Fetch.get("/admin/settings", json()),
  updateSettings: (values: Record<string, string>) => Fetch.patch("/admin/settings", values, json()),
  setCategoryFee: (id: string, fee_percent: number | null) => Fetch.patch(`/admin/settings/categories/${id}/fee`, { fee_percent }, json()),

  flags: () => Fetch.get("/admin/flags", json()),
  setFlag: (key: string, enabled: boolean, description?: string) => Fetch.patch(`/admin/flags/${encodeURIComponent(key)}`, { enabled, description }, json()),
  deleteFlag: (key: string) => Fetch.delete(`/admin/flags/${encodeURIComponent(key)}`, json()),

  promos: () => Fetch.get("/admin/promos", json()),
  createPromo: (p: Partial<Promo>) => Fetch.post("/admin/promos", p, json()),
  updatePromo: (id: string, p: Partial<Promo>) => Fetch.patch(`/admin/promos/${id}`, p, json()),
  deactivatePromo: (id: string) => Fetch.delete(`/admin/promos/${id}`, json()),

  disputes: (status: "open" | "resolved") => Fetch.get(`/admin/disputes?status=${status}`, json()),
  resolveDispute: (bookingId: string, body: { action: "refund" | "partial_refund" | "release"; amount?: number; note: string }) =>
    Fetch.post(`/admin/disputes/${bookingId}/resolve`, body, json()),

  revenue: (from: string, to: string) => Fetch.get(`/admin/reports/revenue?from=${from}&to=${to}`, json()),

  setUserStatus: (id: string, status: 0 | 1) => Fetch.patch(`/admin/users/${id}/status`, { status }, json()),
};
