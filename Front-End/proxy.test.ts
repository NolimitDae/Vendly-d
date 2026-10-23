/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

describe("website proxy", () => {
  const saved = process.env.VENDLY_PROXY_KEY;
  afterEach(() => (process.env.VENDLY_PROXY_KEY = saved));

  it("passes the visitor's address to the API with the shared secret", () => {
    process.env.VENDLY_PROXY_KEY = "shared-secret";
    const res = proxy(new NextRequest("https://vendly.test/api/bookings", { headers: { "x-real-ip": "203.0.113.7" } }));
    expect(forwarded(res, "x-vendly-client-ip")).toBe("203.0.113.7");
    expect(forwarded(res, "x-vendly-proxy-key")).toBe("shared-secret");
  });

  it("never passes on values a visitor sent under those names", () => {
    process.env.VENDLY_PROXY_KEY = "shared-secret";
    const res = proxy(
      new NextRequest("https://vendly.test/api/auth/login", {
        headers: { "x-real-ip": "203.0.113.7", "x-vendly-client-ip": "1.2.3.4", "x-vendly-proxy-key": "guess" },
      }),
    );
    expect(forwarded(res, "x-vendly-client-ip")).toBe("203.0.113.7");
    expect(forwarded(res, "x-vendly-proxy-key")).toBe("shared-secret");
  });

  it("adds nothing without the secret", () => {
    delete process.env.VENDLY_PROXY_KEY;
    const res = proxy(new NextRequest("https://vendly.test/api/bookings", { headers: { "x-real-ip": "203.0.113.7", "x-vendly-client-ip": "1.2.3.4" } }));
    expect(forwarded(res, "x-vendly-client-ip")).toBeNull();
    expect(forwarded(res, "x-vendly-proxy-key")).toBeNull();
  });
});
