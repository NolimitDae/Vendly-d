import sitemap from "./sitemap";
import robots from "./robots";

jest.mock("@/config/app.config", () => ({ AppConfig: () => ({ app: { apiUrl: "https://api.test/api" } }) }));

const reply = (data: unknown[], last_page = 1) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data, meta: { last_page } }) });

describe("sitemap", () => {
  beforeEach(() => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes("/marketplace/listings")) {
        return reply([
          { id: "l1", vendor_id: "v1", updated_at: "2026-10-30T00:00:00Z", is_test: false, vendor: { is_test: false } },
          { id: "l2", vendor_id: "v1", is_test: false, vendor: { is_test: false } },
          { id: "t1", vendor_id: "vt", is_test: true, vendor: { is_test: true } },
        ]);
      }
      if (url.includes("/rentals")) return reply([{ id: "r1", vendor: { is_test: false } }, { id: "r2", vendor: { is_test: true } }]);
      if (url.includes("/event-planner/planners")) return reply([{ id: "pp1", user: { id: "u9", is_test: false } }]);
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  });

  it("lists the public pages and real vendors' packages, shops, rentals and planners, never test vendors", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://vendlymarketplace.com/",
        "https://vendlymarketplace.com/marketplace",
        "https://vendlymarketplace.com/terms",
        "https://vendlymarketplace.com/marketplace/l1",
        "https://vendlymarketplace.com/marketplace/l2",
        "https://vendlymarketplace.com/marketplace/vendors/v1",
        "https://vendlymarketplace.com/rentals/r1",
        "https://vendlymarketplace.com/event-planner/u9",
      ]),
    );
    expect(urls.filter((u) => u.endsWith("/marketplace/vendors/v1"))).toHaveLength(1);
    expect(urls.some((u) => u.includes("/t1") || u.includes("/vt") || u.endsWith("/r2"))).toBe(false);
  });

  it("still lists the public pages when the API is down", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://vendlymarketplace.com/marketplace");
    expect(urls.some((u) => u.includes("/marketplace/l"))).toBe(false);
  });

  it("points search engines at it and keeps private pages out", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://vendlymarketplace.com/sitemap.xml");
    expect((r.rules as { disallow: string[] }).disallow).toEqual(expect.arrayContaining(["/settings", "/chat", "/dashboard"]));
  });
});
