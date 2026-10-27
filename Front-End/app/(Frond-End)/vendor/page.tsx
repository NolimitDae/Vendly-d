"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, DollarSign, Plus, Star, Store, type LucideIcon } from "lucide-react";
import AttentionList from "@/components/vendor/dashboard/AttentionList";
import EarningsChart, { type MonthEarned } from "@/components/vendor/dashboard/EarningsChart";
import UpcomingBookings from "@/components/vendor/dashboard/UpcomingBookings";
import { AuthService } from "@/service/auth/auth.service";
import { EarningsService } from "@/service/earnings/earnings.service";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { VendorDashboardService, type DashboardHome } from "@/service/vendor/vendor-dashboard.service";

/** GET /vendor/dashboard/stats (the app's dashboard uses it too): earned is after Vendly commission and refunds. */
interface DashboardStats {
  revenue_by_month: MonthEarned[];
  total_earned: number;
  bookings: { total: number; by_status: Record<string, number>; upcoming: number };
  rating: { average: number | null; count: number };
  top_clients: { id: string; name: string | null; earned: number; bookings: number }[];
}

const MONTHS = 12;
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatTile({ icon: Icon, label, value, loading }: { icon: LucideIcon; label: string; value: string; loading: boolean }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-white" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {loading ? (
          <div className="h-7 w-16 mt-1 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
        ) : (
          <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{value}</p>
        )}
      </div>
    </div>
  );
}

/** The vendor's home: what needs doing, how the business is going, and what's coming up. */
export default function VendorDashboardPage() {
  const [name, setName] = useState("");
  const [home, setHome] = useState<DashboardHome | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [packages, setPackages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [h, st, l, me] = await Promise.allSettled([
      VendorDashboardService.home(),
      EarningsService.getDashboardStats(MONTHS),
      VendorListingService.getMyListings({ status: "ACTIVE", limit: 1 }),
      AuthService.me(),
    ]);
    if (h.status === "fulfilled" && h.value.data?.success) {
      setHome(h.value.data.data);
      setFailed(false);
    } else {
      setFailed(true);
    }
    if (st.status === "fulfilled" && st.value.data?.success) setStats(st.value.data.data);
    if (l.status === "fulfilled" && l.value.data?.success) setPackages(l.value.data.meta?.total ?? l.value.data.data?.length ?? 0);
    if (me.status === "fulfilled" && me.value.data?.success) setName(me.value.data.data?.name ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const first = name.split(" ")[0];
  const requests = (home?.attention ?? []).filter((i) => i.kind === "request" || i.kind === "changes_approved" || i.kind === "changes_declined").length;
  const by = stats?.bookings.by_status ?? {};

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hello {first || "there"}!</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {requests ? `${requests} booking request${requests === 1 ? "" : "s"} waiting for your answer` : "Here is how your business is doing"}
            </p>
          </div>
          <Link
            href="/vendor/listings/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" aria-hidden /> Add package
          </Link>
        </div>

        <section aria-labelledby="stats-heading" className="space-y-3">
          <h2 id="stats-heading" className="sr-only">
            Your numbers
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={BookOpen} label="Total bookings" value={stats ? String(stats.bookings.total) : "–"} loading={loading} />
            <StatTile icon={DollarSign} label={`Earned (${MONTHS} months)`} value={stats ? money(stats.total_earned) : "–"} loading={loading} />
            <StatTile
              icon={Star}
              label="Average rating"
              value={stats?.rating.average != null ? `${stats.rating.average.toFixed(1)} (${stats.rating.count})` : "–"}
              loading={loading}
            />
            <StatTile icon={Store} label="Active packages" value={packages != null ? String(packages) : "–"} loading={loading} />
          </div>
          {stats && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {by.COMPLETED ?? 0} completed · {(by.CONFIRMED ?? 0) + (by.IN_PROGRESS ?? 0)} confirmed · {by.CANCELLED ?? 0} cancelled. Earned is what reached you
              in the last {MONTHS} months, after Vendly commission and refunds.
            </p>
          )}
        </section>

        {failed && !loading && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            We couldn&apos;t load what needs your attention.{" "}
            <button type="button" onClick={load} className="underline font-medium">
              Try again
            </button>
          </p>
        )}

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <AttentionList items={home?.attention ?? []} loading={loading} />
            <UpcomingBookings bookings={home?.upcoming ?? []} loading={loading} onChanged={load} />
          </div>

          <div className="space-y-6">
            <section aria-labelledby="earned-heading" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 id="earned-heading" className="text-lg font-semibold text-gray-900 dark:text-white">
                  Earned by month
                </h2>
                <Link href="/vendor/earnings" className="text-sm font-medium text-primary dark:text-orchid-300 hover:underline">
                  Earnings
                </Link>
              </div>
              {stats?.revenue_by_month.length ? (
                <EarningsChart months={stats.revenue_by_month} />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{loading ? "Loading…" : "No earnings to show yet."}</p>
              )}
            </section>

            <section aria-labelledby="clients-heading" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <h2 id="clients-heading" className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Top clients
              </h2>
              {stats?.top_clients.length ? (
                <ol className="space-y-3">
                  {stats.top_clients.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <span className="w-5 text-sm text-gray-400" aria-hidden>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{c.name ?? "Customer"}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {c.bookings} booking{c.bookings === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">{money(c.earned)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{loading ? "Loading…" : "Your best customers will show here."}</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
