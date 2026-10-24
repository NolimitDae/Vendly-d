"use client";

import { useParams } from "next/navigation";
import RateVendors from "@/components/reviews/RateVendors";

export default function EventReviewsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <section className="py-10 sm:py-16 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <RateVendors eventId={id} />
      </div>
    </section>
  );
}
