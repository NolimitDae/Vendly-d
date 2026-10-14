"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Download, Loader2 } from "lucide-react";
import { MoneyService, type RevenueDay } from "@/service/admin/money.service";

const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Totals {
  collected: number;
  fees: number;
  refunds: number;
  payouts: number;
  commission: number;
  vendly_revenue: number;
}

export default function RevenuePageContent() {
  const [from, setFrom] = useState(dayjs().subtract(30, "day").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().add(1, "day").format("YYYY-MM-DD"));
  const [days, setDays] = useState<RevenueDay[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    MoneyService.revenue(from, to)
      .then((res) => {
        setDays(res.data?.data?.days ?? []);
        setTotals(res.data?.data?.totals ?? null);
      })
      .catch(() => {
        setDays([]);
        setTotals(null);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const csv = () => {
    const lines = ["date,collected,vendly_fees,commission,refunds,payouts", ...days.map((d) => [d.date, d.collected, d.fees, d.commission, d.refunds, d.payouts].join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendly-revenue-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards: [string, number | undefined][] = [
    ["Collected from customers", totals?.collected],
    ["Vendly revenue (fees + commission)", totals?.vendly_revenue],
    ["Refunded", totals?.refunds],
    ["Paid to vendors", totals?.payouts],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-600 dark:text-gray-300">
          From
          <input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 h-10 px-3 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" />
        </label>
        <label className="text-sm text-gray-600 dark:text-gray-300">
          To
          <input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 h-10 px-3 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" />
        </label>
        <button onClick={csv} disabled={!days.length} className="h-10 px-4 rounded-full border border-gray-200 dark:border-gray-700 text-sm flex items-center gap-2 disabled:opacity-50">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([label, v]) => (
          <div key={label} className="rounded-xl p-4 bg-brand text-white">
            <p className="text-xs opacity-90">{label}</p>
            <p className="text-2xl font-semibold">{v == null ? "–" : money(v)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : (
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Day</th>
                <th className="px-4 py-2 text-right">Collected</th>
                <th className="px-4 py-2 text-right">Vendly fees</th>
                <th className="px-4 py-2 text-right">Commission</th>
                <th className="px-4 py-2 text-right">Refunds</th>
                <th className="px-4 py-2 text-right">Payouts</th>
              </tr>
            </thead>
            <tbody>
              {days.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No money moved in this period.</td>
                </tr>
              )}
              {days.map((d) => (
                <tr key={d.date} className="border-t border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white">
                  <td className="px-4 py-2">{dayjs(d.date).format("MMM D, YYYY")}</td>
                  <td className="px-4 py-2 text-right">{money(d.collected)}</td>
                  <td className="px-4 py-2 text-right">{money(d.fees)}</td>
                  <td className="px-4 py-2 text-right">{money(d.commission)}</td>
                  <td className="px-4 py-2 text-right">{money(d.refunds)}</td>
                  <td className="px-4 py-2 text-right">{money(d.payouts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
