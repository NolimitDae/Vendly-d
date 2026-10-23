"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { ArrowDownLeft, ArrowUpRight, Loader2, Receipt, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BookingMoneyService,
  money,
  type TransactionRow,
  type TransactionsPage,
  type TransactionType,
} from "@/service/payments/booking-money.service";

type Filter = "all" | TransactionType;

const FILTERS: Record<"customer" | "vendor", { key: Filter; label: string }[]> = {
  customer: [
    { key: "all", label: "All" },
    { key: "payment", label: "Payments" },
    { key: "fee", label: "Fees" },
    { key: "refund", label: "Refunds" },
  ],
  vendor: [
    { key: "all", label: "All" },
    { key: "payment", label: "Payments" },
    { key: "payout", label: "Payouts" },
    { key: "fee", label: "Commission" },
    { key: "refund", label: "Refunds" },
  ],
};

const STATUS: Record<TransactionRow["status"], { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  pending: { label: "Pending", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  refunded: { label: "Refunded", cls: "bg-primary/10 text-primary" },
};

const PAGE_SIZE = 20;

/**
 * The signed-in user's money history (GET /payments/transactions) with filter chips, a booking
 * search and "load more". Customers see charges and refunds; vendors see payments received,
 * payouts, commission and money given back.
 */
export default function TransactionsList({ role, title = "Transactions" }: { role: "customer" | "vendor"; title?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [meta, setMeta] = useState<TransactionsPage["meta"] | null>(null);
  const [totals, setTotals] = useState<TransactionsPage["totals"] | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // search as you type, without a request per key
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(false);
      try {
        const res = await BookingMoneyService.transactions({ role, type: filter, q: q || undefined, page: nextPage, limit: PAGE_SIZE });
        const body = res.data as TransactionsPage & { success?: boolean };
        setRows((prev) => (nextPage === 1 ? body.data ?? [] : [...prev, ...(body.data ?? [])]));
        setMeta(body.meta ?? null);
        setTotals(body.totals ?? null);
        setPage(nextPage);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [role, filter, q],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const bookingHref = (id: string) => (role === "vendor" ? `/vendor/bookings/${id}` : `/bookings/${id}`);

  return (
    <section aria-labelledby="transactions-title" className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 id="transactions-title" className="font-semibold text-gray-900 dark:text-white">{title}</h2>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {totals && (
              <span>
                In <span className="font-semibold text-green-600 dark:text-green-400">{money(totals.in)}</span> · Out{" "}
                <span className="font-semibold text-gray-700 dark:text-gray-200">{money(totals.out)}</span>
              </span>
            )}
            <button type="button" onClick={() => load(1)} aria-label="Refresh transactions" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter transactions">
            {FILTERS[role].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition",
                  filter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="relative sm:ml-auto sm:w-64">
            <span className="sr-only">Search by booking</span>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by booking"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>
      </div>

      {error && !rows.length ? (
        <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          Transactions couldn’t be loaded.{" "}
          <button type="button" onClick={() => load(1)} className="text-primary underline">
            Try again
          </button>
        </div>
      ) : loading && !rows.length ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Loading transactions" />
        </div>
      ) : !rows.length ? (
        <div className="py-14 text-center">
          <Receipt className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" aria-hidden />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {q || filter !== "all" ? "No transactions match." : role === "vendor" ? "Payments and payouts will show here." : "Your payments and refunds will show here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map((r) => {
            const incoming = r.amount > 0;
            return (
              <li key={r.id} className="px-6 py-3 flex items-center gap-3">
                <span
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    incoming ? "bg-green-50 text-green-600 dark:bg-green-900/30" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300",
                  )}
                  aria-hidden
                >
                  {incoming ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {dayjs(r.date).format("MMM D, YYYY")}
                    {r.booking_id && r.booking_title ? (
                      <>
                        {" · "}
                        <Link href={bookingHref(r.booking_id)} className="hover:underline">
                          {r.booking_title}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn("text-sm font-semibold", incoming ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-white", r.status === "failed" && "line-through text-gray-400 dark:text-gray-500")}>
                    {incoming ? "+" : ""}
                    {money(r.amount, r.currency)}
                  </p>
                  <span className={cn("inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {meta && page < meta.last_page && (
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 text-center">
          <button type="button" onClick={() => load(page + 1)} disabled={loading} className="text-sm font-medium text-primary disabled:opacity-60">
            {loading ? "Loading…" : `Show more (${meta.total - rows.length} left)`}
          </button>
        </div>
      )}
    </section>
  );
}
