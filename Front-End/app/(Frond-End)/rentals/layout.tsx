import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Event rentals",
  description: "Rent tables, chairs, tents, linens, decor and more for your event. See daily rates and availability, choose delivery or pickup, and book on Vendly.",
  path: "/rentals",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
