import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const AuthService = {
  register: async (data: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    type?: string;
    business_name?: string;
    phone?: string;
  }) =>
    Fetch.post("/auth/register", data, {
      headers: { "Content-Type": "application/json" },
    }),

  login: async (data: { email: string; password: string }) =>
    Fetch.post("/auth/login", data, {
      headers: { "Content-Type": "application/json" },
    }),

  me: async () => Fetch.get("/auth/me", authHeaders()),

  logout: async () => Fetch.post("/auth/logout", {}, authHeaders()),

  verifyEmail: async (data: { email: string; token: string }) =>
    Fetch.post("/auth/verify-email", data, {
      headers: { "Content-Type": "application/json" },
    }),

  forgotPassword: async (email: string) =>
    Fetch.post(
      "/auth/forgot-password",
      { email },
      { headers: { "Content-Type": "application/json" } },
    ),

  resetPassword: async (data: {
    email: string;
    token: string;
    password: string;
  }) =>
    Fetch.post("/auth/reset-password", data, {
      headers: { "Content-Type": "application/json" },
    }),
};
