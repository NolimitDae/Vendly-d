import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // js.stripe.com: Stripe's card form (saved cards); cloudflareinsights: Cloudflare's visitor stats
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http://localhost http://127.0.0.1",
      "font-src 'self'",
      "connect-src 'self' https: wss: ws://localhost:* ws://127.0.0.1:*",
      "frame-src 'self' https: http://localhost:* http://127.0.0.1:*",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/** Hostname of a URL from the environment (custom media domain, API domain), if set. */
const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};
const extraImageHosts = [hostOf(process.env.NEXT_PUBLIC_MEDIA_URL), hostOf(process.env.NEXT_PUBLIC_API_ENDPOINT)].filter((h): h is string => !!h);

/** The API the website's /api path forwards to (baked in at build time, like NEXT_PUBLIC_API_ENDPOINT). */
const apiOrigin = (process.env.NEXT_PUBLIC_API_ENDPOINT || "http://127.0.0.1:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  compress: true,

  // The browser calls the API at the website's own /api path and Next forwards it to the API.
  // That makes the API's login cookies (HttpOnly, SameSite=Lax) first-party cookies of the website's
  // domain, whatever domains the website and API are on. Next's proxy passes Cookie and Set-Cookie
  // through unchanged. proxy.ts adds only the visitor's address (with a shared secret) on the way.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },

  experimental: {
    // the proxy's default 30s is too short for large uploads on slow connections and PDF generation
    proxyTimeout: 120_000,
    // Next 16 copies every request body it forwards and cuts it off at 10 MB by default, which would
    // break multi-photo uploads (10 listing photos, deliverables, event files: up to 10 × 20 MB).
    // The copy is held in memory while the request runs, as the API already does with uploads.
    proxyClientMaxBodySize: "250mb",
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maps.googleapis.com" },
      // Backend local storage (development)
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      // Production storage (S3 / CloudFront / custom CDN)
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      // Cloudflare R2 public buckets, and the API on Railway (files it serves itself)
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.up.railway.app" },
      // a custom media domain (NEXT_PUBLIC_MEDIA_URL) and the API domain
      ...extraImageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
    ],
  },
};

export default nextConfig;
