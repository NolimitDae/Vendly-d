import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const EventPlannerService = {
  listPlanners: async (params?: { page?: number; limit?: number; event_type?: string }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/event-planner/planners?${query.toString()}`);
  },

  getProfile: async (userId: string) =>
    Fetch.get(`/event-planner/planners/${userId}`),

  getMyProfile: async () =>
    Fetch.get("/event-planner/profile/me", authHeaders()),

  upsertProfile: async (formData: FormData) =>
    Fetch.post("/event-planner/profile", formData, {
      headers: {
        Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
        "Content-Type": "multipart/form-data",
      },
    }),
};
