"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Boxes, CalendarRange, MapPin, Package, Search } from "lucide-react";
import { useDebounce } from "@/hooks";
import BrowseSwitch from "@/components/rentals/BrowseSwitch";
import { RentalsService, money, type RentalItem } from "@/service/rentals/rentals.service";

export default function RentalsPage() {
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const debounced = useDebounce(search, 400);
  const dated = !!start && !!end && end >= start;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await RentalsService.browse({ search: debounced || undefined, start_date: dated ? start : undefined, end_date: dated ? end : undefined, limit: 48 });
      if (res.data?.success) setItems(res.data.data);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, [debounced, start, end, dated]);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <BrowseSwitch active="rentals" />
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Rentals</h1>
          <p className="text-gray-500 mt-1 dark:text-gray-400">Decor, furniture, lighting and AV by the day, with live stock and a refundable deposit.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Chairs, arches, speakers, tents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-2 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <CalendarRange className="w-4 h-4 text-gray-400" />
            <label className="sr-only" htmlFor="rent-from">Pickup</label>
            <input id="rent-from" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} className="py-2.5 bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none" />
            <span className="text-gray-400">→</span>
            <label className="sr-only" htmlFor="rent-to">Return</label>
            <input id="rent-to" type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} className="py-2.5 bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none" />
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
          {items.length} item{items.length === 1 ? "" : "s"}{dated ? " · showing stock free for your dates" : ""}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-44 bg-gray-200 dark:bg-gray-700" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg">{debounced ? "Nothing matches that search" : "No rentals listed yet"}</p>
            <p className="text-sm">Vendors are adding decor, furniture and equipment. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((item) => {
              const soldOut = dated && item.available === 0;
              return (
                <Link key={item.id} href={`/rentals/${item.id}${dated ? `?from=${start}&to=${end}` : ""}`} className="group">
                  <div className={`bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition border border-gray-100 dark:border-gray-700 ${soldOut ? "opacity-60" : ""}`}>
                    <div className="relative h-44 bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      {item.images[0] ? (
                        <Image src={item.images[0]} alt={item.title} fill className="object-cover group-hover:scale-105 transition duration-300" unoptimized />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-300 dark:text-gray-600">
                          <Package className="w-10 h-10" />
                        </div>
                      )}
                      <span className="absolute top-3 left-3 bg-white/90 dark:bg-gray-900/90 text-xs font-semibold px-2 py-1 rounded-full text-gray-800 dark:text-gray-100">{money(item.daily_rate)}/day</span>
                    </div>
                    <div className="p-4 space-y-1.5">
                      <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 group-hover:text-primary transition">{item.title}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.vendor?.name}</p>
                      <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                        <span className="flex items-center gap-1">
                          <Boxes className="w-3.5 h-3.5" />
                          {dated ? (soldOut ? "Booked for your dates" : `${item.available} free for your dates`) : `${item.quantity} in stock`}
                        </span>
                        {item.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {item.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
