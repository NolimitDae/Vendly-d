import type { MetadataRoute } from "next";
import { AppConfig } from "@/config/app.config";

/** The public site's address (search engines need full links). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://vendlymarketplace.com").replace(/\/+$/, "");

// rebuilt at most once an hour: new packages show up without a deploy
export const revalidate = 3600;

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

type Row = { id: string; vendor_id?: string; updated_at?: string; is_test?: boolean; vendor?: { is_test?: boolean } | null; user?: { id?: string; is_test?: boolean } | null };

/** Every page of a public list from the API; an API that's down gives what was read so far. */
async function readAll(path: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const res = await fetch(`${AppConfig().app.apiUrl}${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=${PAGE_SIZE}`, { next: { revalidate } });
      if (!res.ok) break;
      const body = await res.json();
      const data: Row[] = Array.isArray(body?.data) ? body.data : [];
      rows.push(...data);
      const last = body?.meta?.last_page ?? body?.meta?.totalPages;
      if (data.length < PAGE_SIZE || (last && page >= last)) break;
    } catch {
      break;
    }
  }
  return rows;
}

/** Test vendors (and their packages and rentals) are for trying the site out, not for search engines. */
const real = (r: Row) => !r.is_test && !r.vendor?.is_test && !r.user?.is_test;

/**
 * /sitemap.xml: the public pages, every live package, its vendor's page, rental items and planners, so search
 * engines find them. Sign-in pages, dashboards and anything private are left out (see robots.ts).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/marketplace`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/rentals`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/event-planner`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/contact-us`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const [listings, rentals, planners] = await Promise.all([readAll("/marketplace/listings"), readAll("/rentals"), readAll("/event-planner/planners")]);
  const live = listings.filter(real);
  const vendors = new Map<string, string | undefined>();
  for (const l of live) if (l.vendor_id && !vendors.has(l.vendor_id)) vendors.set(l.vendor_id, l.updated_at);

  return [
    ...pages,
    ...live.map((l) => ({ url: `${SITE_URL}/marketplace/${l.id}`, lastModified: l.updated_at ? new Date(l.updated_at) : undefined, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...[...vendors].map(([id, at]) => ({ url: `${SITE_URL}/marketplace/vendors/${id}`, lastModified: at ? new Date(at) : undefined, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...rentals.filter(real).map((r) => ({ url: `${SITE_URL}/rentals/${r.id}`, lastModified: r.updated_at ? new Date(r.updated_at) : undefined, changeFrequency: "weekly" as const, priority: 0.5 })),
    // planners' pages are addressed by their account id
    ...planners.filter((p) => real(p) && p.user?.id).map((p) => ({ url: `${SITE_URL}/event-planner/${p.user!.id}`, lastModified: p.updated_at ? new Date(p.updated_at) : undefined, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
