import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { Fetch, __resetSessionState } from "./Fetch";
import { CookieHelper } from "../helper/cookie.helper";

jest.mock("../config/app.config", () => ({ AppConfig: () => ({ app: { apiUrl: "https://api.test/api" } }) }));

// Fake network layer: each test describes how the "server" answers.
type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };
let handler: Handler;
const calls: InternalAxiosRequestConfig[] = [];
const line = (c: InternalAxiosRequestConfig) => `${c.method?.toUpperCase()} ${c.url} ${c.headers?.Authorization ?? ""}`.trim();

beforeAll(() => {
  axios.defaults.adapter = async (config) => {
    calls.push(config);
    const { status, data } = handler(config);
    const response = { status, data, statusText: "", headers: {}, config };
    if (status >= 400) throw new AxiosError("fail", String(status), config, null, response);
    return response;
  };
});

beforeEach(() => {
  calls.length = 0;
  __resetSessionState();
  document.cookie.split(";").forEach((c) => {
    document.cookie = `${c.split("=")[0].trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

// what the ~40 service files still send
const auth = () => ({ headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` } });

describe("Fetch with the HttpOnly login cookie", () => {
  it("calls the API through the website's /api path with credentials and the website header", async () => {
    handler = () => ({ status: 200, data: { ok: true } });
    await Fetch.post("/bookings", {}, auth());
    expect(calls[0].url).toBe("/api/bookings");
    expect(calls[0].withCredentials).toBe(true);
    expect(calls[0].headers["X-Requested-With"]).toBe("vendly-web");
  });

  it("drops the empty Bearer header the service files build when no token is in JS", async () => {
    handler = () => ({ status: 200, data: {} });
    await Fetch.get("/auth/me", auth());
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it("refreshes from the cookie when the session expired and replays the request", async () => {
    let refreshed = false;
    handler = (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshed = true;
        return { status: 201, data: { success: true, authorization: { type: "cookie" } } };
      }
      return refreshed ? { status: 200, data: { ok: true } } : { status: 401, data: {} };
    };

    const res = await Fetch.get("/bookings", auth());

    expect(res.data).toEqual({ ok: true });
    const refresh = calls.find((c) => c.url === "/api/auth/refresh-token")!;
    expect(JSON.parse(refresh.data)).toEqual({}); // the refresh token stays in its HttpOnly cookie
    expect(refresh.headers["X-Requested-With"]).toBe("vendly-web");
    expect(calls.map(line)).toEqual(["GET /api/bookings", "POST /api/auth/refresh-token", "GET /api/bookings"]);
  });

  it("shares one refresh between simultaneous failing requests", async () => {
    let refreshed = false;
    handler = (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshed = true;
        return { status: 201, data: { success: true } };
      }
      return refreshed ? { status: 200, data: {} } : { status: 401, data: {} };
    };

    await Promise.all([Fetch.get("/a", auth()), Fetch.get("/b", auth()), Fetch.get("/c", auth())]);

    expect(calls.filter((c) => c.url?.includes("/auth/refresh-token"))).toHaveLength(1);
  });

  it("signs out when the session can't be renewed", async () => {
    CookieHelper.set({ key: "vendly_logged_in", value: "1" });
    handler = (config) =>
      config.url?.endsWith("/auth/refresh-token")
        ? { status: 201, data: { success: false, message: "Invalid or expired refresh token" } }
        : config.url?.endsWith("/auth/logout")
          ? { status: 201, data: { success: true } }
          : { status: 401, data: {} };

    await expect(Fetch.get("/bookings", auth())).rejects.toBeInstanceOf(AxiosError);
    await new Promise((r) => setTimeout(r, 0));
    expect(CookieHelper.get({ key: "vendly_logged_in" })).toBeUndefined();
    // the API clears the HttpOnly cookies
    expect(calls.some((c) => c.url === "/api/auth/logout")).toBe(true);
  });
});

describe("sessions from before the HttpOnly cookie", () => {
  it("move over on the first call: the readable refresh token is sent once, then dropped", async () => {
    CookieHelper.set({ key: "token", value: "old-access" });
    CookieHelper.set({ key: "refresh_token", value: "refresh-1" });
    handler = () => ({ status: 200, data: { success: true, authorization: { type: "cookie" } } });

    await Fetch.get("/bookings", auth());

    expect(calls.map(line)).toEqual(["POST /api/auth/refresh-token", "GET /api/bookings"]);
    expect(JSON.parse(calls[0].data)).toEqual({ refresh_token: "refresh-1" });
    expect(CookieHelper.get({ key: "token" })).toBeUndefined();
    expect(CookieHelper.get({ key: "refresh_token" })).toBeUndefined();
  });

  it("keep working on the old Bearer token if the move fails", async () => {
    CookieHelper.set({ key: "token", value: "old-access" });
    CookieHelper.set({ key: "refresh_token", value: "revoked" });
    handler = (config) =>
      config.url?.endsWith("/auth/refresh-token") ? { status: 201, data: { success: false } } : { status: 200, data: { ok: true } };

    const res = await Fetch.get("/bookings", auth());

    expect(res.data).toEqual({ ok: true });
    expect(calls.map(line)).toEqual(["POST /api/auth/refresh-token", "GET /api/bookings Bearer old-access"]);
    expect(CookieHelper.get({ key: "refresh_token" })).toBeUndefined();
  });

  it("keep the old cookies if the API still answers with tokens (an API from before the change)", async () => {
    CookieHelper.set({ key: "token", value: "old-access" });
    CookieHelper.set({ key: "refresh_token", value: "refresh-1" });
    handler = (config) =>
      config.url?.endsWith("/auth/refresh-token")
        ? { status: 201, data: { success: true, authorization: { access_token: "new-access", refresh_token: "refresh-2" } } }
        : { status: 200, data: {} };

    await Fetch.get("/bookings", auth());

    expect(calls.map(line)).toEqual(["POST /api/auth/refresh-token", "GET /api/bookings Bearer new-access"]);
    expect(CookieHelper.get({ key: "token" })).toBe("new-access");
  });
});
