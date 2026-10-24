import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const AdminService = {
  // Categories
  getCategories: async () => Fetch.get("/category", authHeaders()),

  createCategory: async (name: string) =>
    Fetch.post(
      "/category",
      { name },
      { headers: { ...authHeaders().headers, "Content-Type": "application/json" } },
    ),

  deleteCategory: async (id: string) =>
    Fetch.delete(`/category/${id}`, authHeaders()),

  renameCategory: async (id: string, name: string) =>
    Fetch.patch(`/category/${id}`, { name }, { headers: { ...authHeaders().headers, "Content-Type": "application/json" } }),

  // Sub-categories
  createSubcategory: async (category_id: string, name: string) =>
    Fetch.post("/subcategory", { category_id, name }, { headers: { ...authHeaders().headers, "Content-Type": "application/json" } }),

  renameSubcategory: async (id: string, name: string) =>
    Fetch.patch(`/subcategory/${id}`, { name }, { headers: { ...authHeaders().headers, "Content-Type": "application/json" } }),

  deleteSubcategory: async (id: string) => Fetch.delete(`/subcategory/${id}`, authHeaders()),

  // Listings (all vendor listings, admin view)
  getListings: async (params?: { page?: number; limit?: number; status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return Fetch.get(`/admin/listings?${q.toString()}`, authHeaders());
  },

  updateListingStatus: async (id: string, status: string) =>
    Fetch.patch(
      `/admin/listings/${id}/status`,
      { status },
      { headers: { ...authHeaders().headers, "Content-Type": "application/json" } },
    ),

  removeListing: async (id: string) =>
    Fetch.delete(`/admin/listings/${id}`, authHeaders()),

  // Vendors
  getVendors: async (params?: { page?: number; limit?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return Fetch.get(`/admin/user/vendors?${q.toString()}`, authHeaders());
  },

  // Bookings
  // from: ISO time, only bookings created at or after it
  getBookings: async (params?: { page?: number; limit?: number; status?: string; from?: string }) => {
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

  // Every event planner (admin): status is approved | pending | suspended | rejected, or all
  getPlanners: async (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && q.set(k, String(v)));
    return Fetch.get(`/admin/user/planners?${q.toString()}`, authHeaders());
  },

  // One planner: profile, licence documents, events, bookings and status history
  getPlanner: async (userId: string) => Fetch.get(`/admin/user/planners/${userId}`, authHeaders()),

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

  // Revenue analytics
  getRevenueByMonth: async (year?: number) => {
    const q = year ? `?year=${year}` : "";
    return Fetch.get(`/admin/payment-transaction/revenue-by-month${q}`, authHeaders());
  },

  // Platform settings
  getSettings: async () => Fetch.get("/admin/settings", authHeaders()),

  updateSettings: async (settings: Record<string, string>) =>
    Fetch.patch(
      "/admin/settings",
      settings,
      { headers: { ...authHeaders().headers, "Content-Type": "application/json" } },
    ),
};
