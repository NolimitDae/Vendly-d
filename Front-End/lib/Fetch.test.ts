import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { Fetch } from "./Fetch";
import { CookieHelper } from "../helper/cookie.helper";

jest.mock("../config/app.config", () => ({ AppConfig: () => ({ app: { apiUrl: "https://api.test" } }) }));

// Fake network layer: each test describes how the "server" answers.
type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };
let handler: Handler;
const calls: string[] = [];

beforeAll(() => {
  axios.defaults.adapter = async (config) => {
    calls.push(`${config.method?.toUpperCase()} ${config.url} ${config.headers?.Authorization ?? ""}`.trim());
    const { status, data } = handler(config);
    const response = { status, data, statusText: "", headers: {}, config };
    if (status >= 400) throw new AxiosError("fail", String(status), config, null, response);
    return response;
  };
});

beforeEach(() => {
  calls.length = 0;
  document.cookie.split(";").forEach((c) => {
    document.cookie = `${c.split("=")[0].trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

const auth = () => ({ headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` } });

describe("Fetch token refresh", () => {
  it("refreshes an expired access token and replays the request", async () => {
    CookieHelper.set({ key: "token", value: "old-access" });
    CookieHelper.set({ key: "refresh_token", value: "refresh-1" });
    handler = (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        return { status: 201, data: { success: true, authorization: { access_token: "new-access", refresh_token: "refresh-2" } } };
      }
      return config.headers?.Authorization === "Bearer new-access"
        ? { status: 200, data: { ok: true } }
        : { status: 401, data: {} };
    };

    const res = await Fetch.get("/bookings", auth());

    expect(res.data).toEqual({ ok: true });
    expect(CookieHelper.get({ key: "token" })).toBe("new-access");
    expect(CookieHelper.get({ key: "refresh_token" })).toBe("refresh-2");
  });

  it("shares one refresh between simultaneous failing requests", async () => {
    CookieHelper.set({ key: "token", value: "old-access" });
    CookieHelper.set({ key: "refresh_token", value: "refresh-1" });
    handler = (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        return { status: 201, data: { success: true, authorization: { access_token: "new-access", refresh_token: "refresh-2" } } };
      }
      return config.headers?.Authorization === "Bearer new-access" ? { status: 200, data: {} } : { status: 401, data: {} };
    };

    await Promise.all([Fetch.get("/a", auth()), Fetch.get("/b", auth()), Fetch.get("/c", auth())]);

    expect(calls.filter((c) => c.includes("/auth/refresh-token"))).toHaveLength(1);
  });

  it("signs out when the refresh token is rejected", async () => {
    CookieHelper.set({ key: "token", value: "old-access" });
    CookieHelper.set({ key: "refresh_token", value: "revoked" });
    handler = (config) =>
      config.url?.endsWith("/auth/refresh-token")
        ? { status: 201, data: { success: false, message: "Invalid or expired refresh token" } }
        : { status: 401, data: {} };

    await expect(Fetch.get("/bookings", auth())).rejects.toBeInstanceOf(AxiosError);
    expect(CookieHelper.get({ key: "token" })).toBeUndefined();
    expect(CookieHelper.get({ key: "refresh_token" })).toBeUndefined();
  });
});
