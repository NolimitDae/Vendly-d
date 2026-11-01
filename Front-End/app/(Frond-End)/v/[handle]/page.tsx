import type { Metadata } from "next";
import VendorShop from "@/components/marketplace/VendorShop";
import { JsonLd, recordMetadata, publicData, vendorJsonLd, vendorMetadata } from "@/lib/seo";

// Next 16: route params arrive as a Promise.
type Props = { params: Promise<{ handle: string }> };

const shop = async (params: Props["params"]) => publicData(`/marketplace/vendors/${encodeURIComponent((await params).handle)}`);

/** Search results and link previews show the shop's name, about text and banner; the shop's one address is /marketplace/vendors/<id>. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await shop(params);
  return recordMetadata(data, "Shop not found", vendorMetadata);
}

/** A vendor's shareable shop link: vendlymarketplace.com/v/<handle>. */
export default async function ShopPage({ params }: Props) {
  const { handle } = await params;
  const data = await shop(params);
  return (
    <>
      {data && <JsonLd data={vendorJsonLd(data)} />}
      <VendorShop idOrHandle={handle} />
    </>
  );
}
