import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
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
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
