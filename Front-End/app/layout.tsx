import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  // relative links in page metadata (canonical, preview images) become full vendlymarketplace.com links
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Vendly — Find Vendors & Event Planners",
    template: "%s | Vendly",
  },
  description:
    "Vendly is a marketplace connecting clients with professional vendors and event planners.",
  keywords: ["vendors", "event planners", "marketplace", "booking"],
  openGraph: {
    type: "website",
    siteName: "Vendly",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [DEFAULT_OG_IMAGE] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
