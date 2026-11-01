import type { Metadata } from "next";
import { JsonLd, missingMetadata, pageMetadata, publicData, ratingOf, SITE_URL, snippet } from "@/lib/seo";

// Next 16: route params arrive as a Promise.
type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

const listing = async (params: Props["params"]) => publicData(`/marketplace/listings/${encodeURIComponent((await params).id)}`);
const vendorName = (l: any) => l?.vendor?.vendorProfile?.business_name || l?.vendor?.name;

/** Search results and link previews (iMessage, WhatsApp, socials) show the package's title, vendor, price and photo. */
export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const data = await listing(params);
  if (data === null) return missingMetadata("Service not found");
  if (!data) return {};
  const title = data.title || "A service on Vendly";
  const vendor = vendorName(data);
  const price = data.price != null ? `From $${Number(data.price).toLocaleString("en-US")}` : null;
  return pageMetadata({
    title: vendor ? `${title} by ${vendor}` : title,
    description: snippet([vendor && `By ${vendor}`, price, data.description].filter(Boolean).join(" · ")),
    path: `/marketplace/${data.id}`,
    image: data.images?.[0],
  });
}

/** The package as a product with its price and star rating, for Google's rich results. */
export default async function ListingLayout({ params, children }: Props) {
  const data = await listing(params);
  return (
    <>
      {data && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Product",
            name: data.title,
            ...(data.description ? { description: snippet(data.description, 500) } : {}),
            ...(data.images?.length ? { image: data.images.slice(0, 5) } : {}),
            ...(data.category?.name ? { category: data.category.name } : {}),
            ...(vendorName(data) ? { brand: { "@type": "Brand", name: vendorName(data) } } : {}),
            url: `${SITE_URL}/marketplace/${data.id}`,
            ...(data.price != null
              ? { offers: { "@type": "Offer", price: Number(data.price), priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE_URL}/marketplace/${data.id}` } }
              : {}),
            ...ratingOf(data.avg_rating, data._count?.reviews),
          }}
        />
      )}
      {children}
    </>
  );
}
