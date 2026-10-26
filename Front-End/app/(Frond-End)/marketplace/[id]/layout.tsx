import type { Metadata } from "next";
import { AppConfig } from "@/config/app.config";

// Next 16: route params arrive as a Promise.
type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

/** Link previews (iMessage, WhatsApp, socials) for a shared package show its title, vendor, price and photo. */
export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  try {
    const { id } = await params;
    const res = await fetch(`${AppConfig().app.apiUrl}/marketplace/listings/${encodeURIComponent(id)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return { title: "Service not found" };
    const { data } = await res.json();
    const title = data?.title || "A service on Vendly";
    const vendor = data?.vendor?.vendorProfile?.business_name || data?.vendor?.name;
    const price = data?.price != null ? `From $${Number(data.price).toLocaleString("en-US")}` : null;
    const description = [vendor && `By ${vendor}`, price, data?.description].filter(Boolean).join(" · ").slice(0, 160);
    const image = data?.images?.[0];
    return {
      title,
      description,
      openGraph: { title, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return {};
  }
}

export default function ListingLayout({ children }: Props) {
  return children;
}
