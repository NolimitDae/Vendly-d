import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Find vendors for your event",
  description: "Browse caterers, DJs, photographers, decorators and more. Compare packages, prices and reviews, check availability and book vendors for your event on Vendly.",
  path: "/marketplace",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
