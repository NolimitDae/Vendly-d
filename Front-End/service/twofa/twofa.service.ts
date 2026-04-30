import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const TwoFAService = {
  getStatus: async () => Fetch.get("/auth/2fa-status", authHeaders()),

  generateSecret: async () =>
    Fetch.post("/auth/generate-2fa-secret", {}, authHeaders()),

  verifyToken: async (token: string) =>
    Fetch.post("/auth/verify-2fa", { token }, authHeaders()),

  enable: async () => Fetch.post("/auth/enable-2fa", {}, authHeaders()),

  disable: async (token: string) =>
    Fetch.post("/auth/disable-2fa", { token }, authHeaders()),
};
