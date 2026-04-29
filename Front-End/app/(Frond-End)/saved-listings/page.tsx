"use client";

import { Bookmark } from "lucide-react";
import Link from "next/link";
import Container from "@/app/_components/Container";

export default function SavedListingsPage() {
  return (
    <section className="py-16 sm:py-24 min-h-screen">
      <Container>
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-blackColor dark:text-white">
            Saved Listings
          </h1>
          <p className="text-descriptionColor dark:text-gray-400 text-sm mt-1">
            Services you&apos;ve bookmarked for later
          </p>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-grayBg dark:bg-gray-800 flex items-center justify-center mb-5">
            <Bookmark className="w-7 h-7 text-descriptionColor" />
          </div>
          <h2 className="text-lg font-semibold text-blackColor dark:text-white mb-2">
            No saved listings yet
          </h2>
          <p className="text-descriptionColor dark:text-gray-400 text-sm max-w-xs mb-6">
            Browse the marketplace and save services you&apos;re interested in
            to find them quickly later.
          </p>
          <Link
            href="/marketplace"
            className="gradient-bg text-white font-semibold px-7 py-2.5 rounded-full text-sm hover:opacity-90 transition"
          >
            Browse Marketplace
          </Link>
        </div>
      </Container>
    </section>
  );
}
