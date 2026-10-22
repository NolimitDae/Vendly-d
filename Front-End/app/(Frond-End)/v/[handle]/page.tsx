import type { Metadata } from "next";
import VendorShop from "@/components/marketplace/VendorShop";
import { AppConfig } from "@/config/app.config";

type Props = { params: { handle: string } };

/** Link previews (iMessage, WhatsApp, socials) show the shop's name, about text and banner. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const res = await fetch(`${AppConfig().app.apiUrl}/marketplace/vendors/${encodeURIComponent(params.handle)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return { title: "Shop not found | Vendly" };
    const { data } = await res.json();
    const name = data?.vendorProfile?.business_name || data?.name || "Vendly vendor";
    const description = (data?.vendorProfile?.about_me || `Book ${name} on Vendly.`).slice(0, 160);
    const image = data?.banner_url || data?.logo_url || data?.avatar_url;
    return {
      title: `${name} | Vendly`,
      description,
      openGraph: { title: name, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return { title: "Vendly" };
  }
}

/** A vendor's shareable shop link: vendlymarketplace.com/v/<handle>. */
export default function ShopPage({ params }: Props) {
  return <VendorShop idOrHandle={params.handle} />;
}
