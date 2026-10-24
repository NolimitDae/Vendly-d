import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export interface SimilarVendorsData {
  items: { id: string; title: string; price: number; image: string | null; vendor_id: string; vendor_name: string | null; avg_rating: number | null }[];
  /** the marketplace, filtered by the category and date */
  url: string;
  category_id: string;
  date: string;
}

/** After a vendor cancels: packages in the same category from vendors free on the customer's date. */
export default function SimilarVendors({ data }: { data: SimilarVendorsData }) {
  const more = `/marketplace?category_id=${encodeURIComponent(data.category_id)}&date=${encodeURIComponent(data.date)}`;
  return (
    <section aria-labelledby="similar-vendors-title" className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" aria-hidden />
        <h2 id="similar-vendors-title" className="font-semibold text-gray-900 dark:text-white">Similar vendors free on your date</h2>
      </div>
      {data.items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((v) => (
            <li key={v.id}>
              <Link href={`/marketplace/${v.id}`} className="flex gap-3 rounded-lg border border-gray-100 dark:border-gray-700 p-3 hover:border-primary/40">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                  {v.image && <Image src={v.image} alt="" fill className="object-cover" unoptimized />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">{v.title}</p>
                  {v.vendor_name && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{v.vendor_name}</p>}
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    ${Number(v.price).toFixed(2)}
                    {v.avg_rating ? ` · ${Number(v.avg_rating).toFixed(1)} stars` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">We couldn’t find another vendor free on that day yet.</p>
      )}
      <Link href={more} className="inline-block text-sm font-semibold text-primary">
        See all vendors free on your date
      </Link>
    </section>
  );
}
