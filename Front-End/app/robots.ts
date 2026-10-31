import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

/** /robots.txt: search engines may read the public pages; accounts, dashboards and messages stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/settings", "/chat", "/bookings", "/wallet", "/notifications", "/contracts", "/favorites", "/saved-listings", "/my-events", "/vendor", "/event-planner/dashboard", "/event-planner/events", "/event-planner/profile", "/auth", "/login", "/signup", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
