"use client";

import Link from "next/link";
import { Package, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeature } from "@/hooks/useFeature";

/** Services ↔ Rentals switch shown at the top of both browse pages. */
export default function BrowseSwitch({ active }: { active: "services" | "rentals" }) {
  // Admin can switch rentals off; the switch then disappears from the services page
  const rentalsOn = useFeature("rentals");
  if (!rentalsOn && active === "services") return null;
  const tab = (on: boolean) =>
    cn(
      "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition",
      on ? "bg-primary text-primary-foreground shadow-sm" : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white",
    );
  return (
    <nav aria-label="Browse" className="inline-flex p-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-5">
      <Link href="/marketplace" className={tab(active === "services")} aria-current={active === "services" ? "page" : undefined}>
        <Store className="w-4 h-4" /> Services
      </Link>
      <Link href="/rentals" className={tab(active === "rentals")} aria-current={active === "rentals" ? "page" : undefined}>
        <Package className="w-4 h-4" /> Rentals
      </Link>
    </nav>
  );
}
