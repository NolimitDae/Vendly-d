import { renderToStaticMarkup } from "react-dom/server";
import { JsonLd, pageMetadata, ratingOf, recordMetadata, snippet, vendorJsonLd } from "./seo";

describe("seo helpers", () => {
  it("gives a page its title, canonical link and a preview picture", () => {
    const m = pageMetadata({ title: "Event rentals", description: "Rent things", path: "/rentals" });
    expect(m.title).toEqual({ absolute: "Event rentals | Vendly", template: "%s | Vendly" });
    expect(m.alternates).toEqual({ canonical: "/rentals" });
    expect((m.openGraph as any).images[0].url).toBe("/og.png");
    expect((pageMetadata({ description: "d", path: "/x", image: "https://cdn/a.jpg" }).openGraph as any).images).toEqual(["https://cdn/a.jpg"]);
  });

  it("marks a missing record not to be listed, and leaves pages alone while the API is down", () => {
    const build = jest.fn(() => ({ title: "Shop" }));
    expect(recordMetadata(null, "Shop not found", build)).toEqual({ title: "Shop not found", robots: { index: false }, alternates: { canonical: null } });
    expect(recordMetadata(undefined, "Shop not found", build)).toEqual({});
    expect(recordMetadata({ id: "1" }, "Shop not found", build)).toEqual({ title: "Shop" });
  });

  it("never lets listing text close the structured data's script tag", () => {
    const html = renderToStaticMarkup(<JsonLd data={{ name: "</script><script>alert(1)</script>" }} />);
    expect(html).not.toContain("</script><script>");
    expect(JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, "")).name).toBe("</script><script>alert(1)</script>");
  });

  it("keeps descriptions to one short line", () => {
    expect(snippet("a\n\n b")).toBe("a b");
    expect(snippet("x".repeat(200))).toHaveLength(160);
  });

  it("only adds star ratings when there are reviews", () => {
    expect(ratingOf(null, 0)).toEqual({});
    expect(ratingOf(4.66, 3)).toEqual({ aggregateRating: expect.objectContaining({ ratingValue: 4.7, reviewCount: 3 }) });
    const v = vendorJsonLd({ id: "v1", name: "Ada", vendorProfile: { business_name: "Ada Eats" }, socials: { instagram: "https://instagram.com/ada", tiktok: null }, avg_rating: 5, _count: { receivedReviews: 2 } });
    expect(v).toMatchObject({ "@type": "LocalBusiness", name: "Ada Eats", url: "https://vendlymarketplace.com/marketplace/vendors/v1", sameAs: ["https://instagram.com/ada"] });
  });
});
