import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const auth = () => ({ headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` } });

export type SwitchableRole = "CUSTOMER" | "VENDOR" | "EVENT_PLANNER";
export type IdStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export interface RolesInfo {
  active: SwitchableRole | null;
  roles: SwitchableRole[];
  available: SwitchableRole[];
  id_verification: { verified: boolean; status: IdStatus; rejection_reason: string | null; submitted_at: string | null };
}

/** One login, several roles, and the ID check that unlocks switching. */
export const IdentityService = {
  roles: async () => Fetch.get("/auth/roles", auth()),
  switchRole: async (role: SwitchableRole, business_name?: string) =>
    Fetch.post("/auth/roles/switch", { role, ...(business_name ? { business_name } : {}) }, auth()),
  status: async () => Fetch.get("/identity/me", auth()),
  /** multipart: document_type, legal_name, front, back (not for passports), selfie */
  submit: async (form: FormData) => Fetch.post("/identity", form, auth()),
};

export const AdminIdentityService = {
  list: async (status?: IdStatus, page = 1) =>
    Fetch.get(`/admin/identity?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page) })}`, auth()),
  get: async (id: string) => Fetch.get(`/admin/identity/${id}`, auth()),
  review: async (id: string, status: "APPROVED" | "REJECTED", reason?: string) =>
    Fetch.patch(`/admin/identity/${id}`, { status, ...(reason ? { reason } : {}) }, auth()),
};
