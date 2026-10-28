"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/app/_components/Container";
import SavedVendors from "./SavedVendors";
import SavedServices from "./SavedServices";

type FavoritesTab = "vendors" | "services";

const TABS: { key: FavoritesTab; label: string }[] = [
  { key: "vendors", label: "Vendors" },
  { key: "services", label: "Services" },
];

/** Favorites: saved vendors and saved services (packages), one tab each (?tab=vendors|services). */
export default function FavoritesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<FavoritesTab>(searchParams.get("tab") === "services" ? "services" : "vendors");

  const choose = (key: FavoritesTab) => {
    setTab(key);
    router.replace(`/favorites?tab=${key}`, { scroll: false });
  };

  return (
    <section className="py-12 sm:py-20 min-h-screen bg-gray-50 dark:bg-gray-900">
      <Container>
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Favorites</h1>
          <Link
            href="/marketplace"
            className="flex items-center gap-1.5 text-sm text-primary font-medium hover:opacity-80 transition"
          >
            Browse marketplace
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div role="tablist" aria-label="Favorites" className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              id={`favorites-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="favorites-panel"
              onClick={() => choose(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="favorites-panel" aria-labelledby={`favorites-tab-${tab}`}>
          {tab === "vendors" ? <SavedVendors /> : <SavedServices />}
        </div>
      </Container>
    </section>
  );
}
