import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const AdminService = {
  // Vendors
  getVendors: async (params?: { page?: number; limit?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return Fetch.get(`/admin/user/vendors?${q.toString()}`, authHeaders());
  },

  // Bookings
  getBookings: async (params?: { page?: number; limit?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return Fetch.get(`/admin/bookings?${q.toString()}`, authHeaders());
  },

  // Transactions
  getTransactions: async () =>
    Fetch.get("/admin/payment-transaction", authHeaders()),

  // Pending license requests (vendors + event planners)
  getPendingLicense: async () =>
    Fetch.get("/admin/user/pending-license", authHeaders()),

  // Approve or reject a license
  updateLicenseStatus: async (userId: string, licenseStatus: "APPROVED" | "SUSPENDED") =>
    Fetch.patch(
      `/admin/user/approve-license/${userId}`,
      { licenseStatus },
      { headers: { ...authHeaders().headers, "Content-Type": "application/json" } },
    ),

  // Event planners (approved)
  getEventPlanners: async (params?: { page?: number; limit?: number; event_type?: string }) => {
    const q = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return Fetch.get(`/event-planner/planners?${q.toString()}`, authHeaders());
  },

  // Event planner pending approvals
  getPendingEventPlanners: async (params?: { page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return Fetch.get(`/event-planner/admin/pending?${q.toString()}`, authHeaders());
  },

  // Update event planner approval status
  updateEventPlannerStatus: async (userId: string, status: string) =>
    Fetch.patch(
      `/event-planner/admin/${userId}/status`,
      { status },
      { headers: { ...authHeaders().headers, "Content-Type": "application/json" } },
    ),
};
