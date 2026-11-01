import type { Metadata } from "next";
import { JsonLd, missingMetadata, pageMetadata, publicData, SITE_URL, snippet } from "@/lib/seo";

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

const item = async (params: Props["params"]) => publicData(`/rentals/${encodeURIComponent((await params).id)}`);

/** Search results and link previews show the item, its daily rate and photo. */
export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const data = await item(params);
  if (data === null) return missingMetadata("Rental not found");
  if (!data) return {};
  const rate = data.daily_rate != null ? `$${Number(data.daily_rate).toLocaleString("en-US")} a day` : null;
  return pageMetadata({
    title: `${data.title || "Rental"} for rent`,
    description: snippet([rate, data.vendor?.name && `From ${data.vendor.name}`, data.description].filter(Boolean).join(" · ") || "Rent it for your event on Vendly."),
    path: `/rentals/${data.id}`,
    image: data.images?.[0],
  });
}

/** The item with its daily rate, for Google's rich results. */
export default async function RentalLayout({ params, children }: Props) {
  const data = await item(params);
  const url = data ? `${SITE_URL}/rentals/${data.id}` : "";
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
            url,
            ...(data.daily_rate != null
              ? {
                  offers: {
                    "@type": "Offer",
                    price: Number(data.daily_rate),
                    priceCurrency: "USD",
                    priceSpecification: { "@type": "UnitPriceSpecification", price: Number(data.daily_rate), priceCurrency: "USD", unitText: "day" },
                    availability: "https://schema.org/InStock",
                    url,
                  },
                }
              : {}),
          }}
        />
      )}
      {children}
    </>
  );
}
