"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CreditCard,
  FileSignature,
  LayoutDashboard,
  Menu,
  Package,
  PlusSquare,
  Receipt,
  Star,
  Store,
  TrendingUp,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeature, useFeatureOptIn } from "@/hooks/useFeature";

export interface VendorNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** The vendor pages, in the order the menu lists them. Rentals and Subscription only when switched on. */
export function vendorNavItems({ rentals, plans }: { rentals: boolean; plans: boolean }): VendorNavItem[] {
  return [
    { label: "Dashboard", href: "/vendor", icon: LayoutDashboard },
    { label: "Bookings", href: "/vendor/bookings", icon: BookOpen },
    { label: "Packages", href: "/vendor/listings", icon: Store },
    ...(rentals ? [{ label: "Rentals", href: "/vendor/rentals", icon: Package }] : []),
    { label: "Earnings", href: "/vendor/earnings", icon: TrendingUp },
    { label: "Contracts", href: "/vendor/contracts", icon: FileSignature },
    { label: "Add-ons", href: "/vendor/add-ons", icon: PlusSquare },
    { label: "Fees", href: "/vendor/add-ons?tab=fees", icon: Receipt },
    { label: "Reviews", href: "/vendor/reviews", icon: Star },
    { label: "Profile", href: "/vendor/profile", icon: User },
    ...(plans ? [{ label: "Subscription", href: "/vendor/subscription", icon: CreditCard }] : []),
  ];
}

/**
 * Which menu item the page belongs to: Dashboard only on /vendor itself, the others for their page and
 * the pages under it (a booking, a package). Add-ons and Fees share a page and differ by its tab.
 */
export function isActiveItem(item: VendorNavItem, pathname: string, tab: string | null): boolean {
  const [path, query] = item.href.split("?");
  if (path === "/vendor") return pathname === "/vendor" || pathname === "/vendor/";
  if (!(pathname === path || pathname.startsWith(`${path}/`))) return false;
  const wantsFees = query === "tab=fees";
  return path === "/vendor/add-ons" ? wantsFees === (tab === "fees") : true;
}

function NavList({ items, pathname, tab, onNavigate }: { items: VendorNavItem[]; pathname: string; tab: string | null; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isActiveItem(item, pathname, tab);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-primary/10 text-primary font-semibold dark:bg-primary/20 dark:text-orchid-300"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Sidebar({ tab }: { tab: string | null }) {
  const pathname = usePathname() ?? "";
  const rentals = useFeature("rentals");
  // vendor plans stay hidden until they launch, as in the navbar
  const plans = useFeatureOptIn("subscriptions") === true;
  const items = vendorNavItems({ rentals, plans });
  const current = items.find((i) => isActiveItem(i, pathname, tab));
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  // closes on Escape and hands focus back to the menu button; opening moves focus into the menu
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // a new page closes the menu
  useEffect(() => setOpen(false), [pathname, tab]);

  return (
    <>
      {/* phones and tablets: a bar with the current page and a menu button */}
      <div className="lg:hidden px-4 md:px-8 pt-4">
        <div className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-2.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{current?.label ?? "Vendor"}</span>
          <button
            ref={toggle}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="vendor-menu-drawer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {open ? <X className="w-4 h-4" aria-hidden /> : <Menu className="w-4 h-4" aria-hidden />}
            Vendor menu
          </button>
        </div>
        {open && (
          <div ref={drawer} id="vendor-menu-drawer" className="mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-2 shadow-lg">
            <nav aria-label="Vendor pages">
              <NavList items={items} pathname={pathname} tab={tab} onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        )}
      </div>

      {/* desktop: a menu down the left side */}
      <aside className="hidden lg:block w-60 flex-shrink-0 pl-6 py-8">
        <nav aria-label="Vendor pages" className="sticky top-6 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-3">
          <p className="px-3 pt-1 pb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Your business</p>
          <NavList items={items} pathname={pathname} tab={tab} />
        </nav>
      </aside>
    </>
  );
}

function WithTab() {
  return <Sidebar tab={useSearchParams()?.get("tab") ?? null} />;
}

/** The menu for every vendor page: down the left on desktop, a menu button above the page on smaller screens. */
export default function VendorSidebar() {
  // reading the query needs a Suspense boundary for pages rendered ahead of time
  return (
    <Suspense fallback={<Sidebar tab={null} />}>
      <WithTab />
    </Suspense>
  );
}
