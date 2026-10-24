import { NextResponse, type NextRequest } from "next/server";

/**
 * API calls reach the API through the website (see the /api rewrite in next.config.ts), so the API
 * would see the website server's address instead of the visitor's. Railway's edge puts the visitor's
 * address in X-Real-IP here; pass it on with a shared secret (VENDLY_PROXY_KEY, set on both services)
 * so the API can trust it for rate limits and signature records. Without the secret nothing is added.
 * Only headers are touched; the request body is passed on as is.
 */
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  // whatever a visitor sends under these names is never passed on
  headers.delete("x-vendly-client-ip");
  headers.delete("x-vendly-proxy-key");
  // Cloudflare's own headers from the visitor's request are not passed on to the API
  for (const name of [...headers.keys()]) if (name.startsWith("cf-") || name === "cdn-loop") headers.delete(name);
  const key = process.env.VENDLY_PROXY_KEY;
  const ip = req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (key && ip) {
    headers.set("x-vendly-client-ip", ip);
    headers.set("x-vendly-proxy-key", key);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
