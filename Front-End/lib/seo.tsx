import type { Metadata } from "next";
import { AppConfig } from "@/config/app.config";

/** The public site's address (search engines and link previews need full links). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://vendlymarketplace.com").replace(/\/+$/, "");

/** The picture link previews show when a page has none of its own (public/og.png, 1200x630). */
export const DEFAULT_OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Vendly Marketplace" };

/**
 * Title, description, canonical link and link-preview tags for a public page. `path` is the page's own
 * address ("/marketplace"); the canonical link tells search engines it's the one copy of that page.
 */
export function pageMetadata({ title, description, path, image }: { title?: string; description: string; path: string; image?: string | null }): Metadata {
  const images = image ? [image] : [DEFAULT_OG_IMAGE];
  return {
    // a plain title here would stop "| Vendly" being added to the pages under this one, so it's kept explicitly
    ...(title ? { title: { absolute: `${title} | Vendly`, template: "%s | Vendly" } } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Vendly", url: path, ...(title ? { title } : {}), description, images },
    twitter: { card: "summary_large_image", ...(title ? { title } : {}), description, images },
  };
}

/** A page whose record is gone (or never existed): search engines are told not to list it. */
export const missingMetadata = (title: string): Metadata => ({ title, robots: { index: false }, alternates: { canonical: null } });

/** Metadata for a page's record: its own, "not found" (not to be listed) when it's gone, else the section's while the API is unreachable. */
export const recordMetadata = <T,>(data: T | null | undefined, missingTitle: string, build: (d: T) => Metadata): Metadata =>
  data ? build(data) : data === null ? missingMetadata(missingTitle) : {};

/** A description that fits search results (about 160 characters, on one line). */
export const snippet = (text: string | null | undefined, max = 160) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/**
 * Structured data (schema.org JSON-LD) Google reads for rich results. "<" is escaped so text from a
 * listing can never close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** Star ratings for structured data, only when there are reviews (Google rejects empty ones). */
export const ratingOf = (avg: number | null | undefined, count: number | null | undefined) =>
  avg && count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Math.round(avg * 10) / 10, reviewCount: count, bestRating: 5, worstRating: 1 } } : {};

/**
 * A public record from the API for a page's metadata (cached 5 minutes): null when the API says it doesn't
 * exist, undefined when it couldn't be read (the API is down), so a brief outage never marks pages as gone.
 */
export async function publicData<T = any>(path: string): Promise<T | null | undefined> {
  try {
    const res = await fetch(`${AppConfig().app.apiUrl}${path}`, { next: { revalidate: 300 } });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const body = await res.json();
    return (body?.data ?? undefined) as T | undefined;
  } catch {
    return undefined;
  }
}

/** A vendor shop's structured data (its one address on the site is /marketplace/vendors/<id>). */
export function vendorJsonLd(v: any) {
  const name = v?.vendorProfile?.business_name || v?.name;
  const socials = v?.socials && typeof v.socials === "object" ? Object.values(v.socials).filter((s): s is string => typeof s === "string" && !!s) : [];
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url: `${SITE_URL}/marketplace/vendors/${v.id}`,
    ...(v?.vendorProfile?.about_me ? { description: snippet(v.vendorProfile.about_me, 500) } : {}),
    ...(v?.logo_url || v?.avatar_url || v?.banner_url ? { image: v.logo_url || v.avatar_url || v.banner_url } : {}),
    ...(typeof v?.location === "string" && v.location ? { address: v.location } : {}),
    ...(socials.length ? { sameAs: socials } : {}),
    ...ratingOf(v?.avg_rating, v?._count?.receivedReviews),
  };
}

/** Title, description and preview for a vendor shop, under its one canonical address. */
export function vendorMetadata(v: any): Metadata {
  const name = v?.vendorProfile?.business_name || v?.name || "Vendly vendor";
  return pageMetadata({
    title: name,
    description: snippet(v?.vendorProfile?.about_me || `See ${name}'s packages, prices and reviews, and book them for your event on Vendly.`),
    path: `/marketplace/vendors/${v.id}`,
    image: v?.banner_url || v?.logo_url || v?.avatar_url,
  });
}
