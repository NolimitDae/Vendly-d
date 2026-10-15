import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // js.stripe.com: Stripe's card form (saved cards) loads its script from there
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  compress: true,

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
