import type { Metadata } from "next";
import VendorShop from "@/components/marketplace/VendorShop";
import { AppConfig } from "@/config/app.config";

// Next 16: route params arrive as a Promise.
type Props = { params: Promise<{ handle: string }> };

/** Link previews (iMessage, WhatsApp, socials) show the shop's name, about text and banner. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { handle } = await params;
    const res = await fetch(`${AppConfig().app.apiUrl}/marketplace/vendors/${encodeURIComponent(handle)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return { title: "Shop not found" };
    const { data } = await res.json();
    const name = data?.vendorProfile?.business_name || data?.name || "Vendly vendor";
    const description = (data?.vendorProfile?.about_me || `Book ${name} on Vendly.`).slice(0, 160);
    const image = data?.banner_url || data?.logo_url || data?.avatar_url;
    return {
      title: name,
      description,
      openGraph: { title: name, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return {};
  }
}

/** A vendor's shareable shop link: vendlymarketplace.com/v/<handle>. */
export default async function ShopPage({ params }: Props) {
  const { handle } = await params;
  return <VendorShop idOrHandle={handle} />;
}
