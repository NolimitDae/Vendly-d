import type { Metadata } from "next";
import { JsonLd, recordMetadata, publicData, vendorJsonLd, vendorMetadata } from "@/lib/seo";

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

const vendor = async (params: Props["params"]) => publicData(`/marketplace/vendors/${encodeURIComponent((await params).id)}`);

/** Search results and link previews show the shop's name, about text and banner. */
export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const data = await vendor(params);
  return recordMetadata(data, "Vendor not found", vendorMetadata);
}

export default async function VendorLayout({ params, children }: Props) {
  const data = await vendor(params);
  return (
    <>
      {data && <JsonLd data={vendorJsonLd(data)} />}
      {children}
    </>
  );
}
