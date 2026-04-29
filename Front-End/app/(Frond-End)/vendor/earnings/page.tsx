"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  Download,
  ArrowUpCircle,
  ExternalLink,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "react-toastify";
import { EarningsService } from "@/service/earnings/earnings.service";
import { cn } from "@/lib/utils";

/* ─── Constants ──────────────────────────────────────────────── */
const COMMISSION_RATE = 0.1; // 10% platform fee

/* ─── Types ──────────────────────────────────────────────────── */
interface Booking {
  id: string;
  created_at: string;
  completed_at?: string | null;
  status: string;
  amount?: string | number | null;
  currency?: string;
  customer?: { id: string; name: string; avatar_url?: string | null };
  listing?: { id: string; title: string; price?: string | number };
}

interface Transaction {
  id: string;
  type?: string;
  status?: string;
  amount?: string | number;
  reference_number?: string;
  created_at: string;
}

interface AccountInfo {
  hasConnectedAccount: boolean;
  accountId: string | null;
  email: string;
  name: string;
}

interface StripeBalance {
  available: { amount: number; display: string };
  pending: { amount: number; display: string };
}

/* ─── Helpers ────────────────────────────────────────────────── */
function amt(v: string | number | null | undefined) {
  return Number(v ?? 0);
}

/* ─── Custom bar tooltip ─────────────────────────────────────── */
const BarTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-2.5 shadow-lg text-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
      <p className="font-medium pb-2 text-gray-700 dark:text-gray-300">{label}</p>
      <p className="flex items-center gap-1.5 pt-2 text-gray-600 dark:text-gray-400">
        <span className="w-2.5 h-2.5 rounded-sm bg-[#795FF4] inline-block" />
        Earnings: ${payload[0]?.value?.toLocaleString() ?? 0}
      </p>
    </div>
  );
};

/* ─── Summary card ───────────────────────────────────────────── */
function SummaryCard({
  icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {label}
          </p>
          {loading ? (
            <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
              {value}
            </p>
          )}
          {sub && !loading && (
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          )}
        </div>
        <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function VendorEarningsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>([]);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [stripeBalance, setStripeBalance] = useState<StripeBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);

  /* Payout state */
  const [payoutAmount, setPayoutAmount] = useState("");
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [connectingAccount, setConnectingAccount] = useState(false);
  const [gettingLink, setGettingLink] = useState(false);

  /* Table state */
  const [txPage, setTxPage] = useState(1);
  const TX_PER_PAGE = 10;

  /* ── Load data ─────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookingsRes, withdrawalsRes, infoRes] = await Promise.allSettled([
        EarningsService.getBookings({ limit: 500 }),
        EarningsService.getWithdrawHistory(),
        EarningsService.getAccountInfo(),
      ]);

      if (bookingsRes.status === "fulfilled" && bookingsRes.value.data?.success) {
        setBookings(bookingsRes.value.data.data ?? []);
      }
      if (
        withdrawalsRes.status === "fulfilled" &&
        withdrawalsRes.value.data?.success
      ) {
        setWithdrawals(withdrawalsRes.value.data.data ?? []);
      }
      if (infoRes.status === "fulfilled" && infoRes.value.data?.success) {
        const info: AccountInfo = infoRes.value.data.data;
        setAccountInfo(info);
        if (info.hasConnectedAccount) refreshStripeBalance();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshStripeBalance = async () => {
    setLoadingBalance(true);
    try {
      const res = await EarningsService.getStripeBalance();
      if (res.data?.success) setStripeBalance(res.data.data);
    } catch {
      // user may not have connected account
    } finally {
      setLoadingBalance(false);
    }
  };

  /* ── Computed analytics ────────────────────────────────────── */
  const completed = useMemo(
    () => bookings.filter((b) => b.status === "COMPLETED"),
    [bookings],
  );
  const cancelled = useMemo(
    () => bookings.filter((b) => b.status === "CANCELLED"),
    [bookings],
  );
  const pending = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === "PENDING" || b.status === "CONFIRMED" || b.status === "IN_PROGRESS",
      ),
    [bookings],
  );

  const totalEarned = useMemo(
    () => completed.reduce((s, b) => s + amt(b.amount), 0),
    [completed],
  );

  const thisMonthEarned = useMemo(() => {
    const now = dayjs();
    return completed
      .filter((b) => {
        const d = dayjs(b.completed_at ?? b.created_at);
        return d.month() === now.month() && d.year() === now.year();
      })
      .reduce((s, b) => s + amt(b.amount), 0);
  }, [completed]);

  const totalWithdrawn = useMemo(
    () =>
      withdrawals
        .filter((t) => t.status === "completed")
        .reduce((s, t) => s + amt(t.amount), 0),
    [withdrawals],
  );

  const pendingPayouts = useMemo(
    () => Math.max(0, totalEarned * (1 - COMMISSION_RATE) - totalWithdrawn),
    [totalEarned, totalWithdrawn],
  );

  const avgBookingValue = completed.length
    ? totalEarned / completed.length
    : 0;

  /* ── Monthly chart data (last 6 months) ───────────────────── */
  const chartData = useMemo(() => {
    const now = dayjs();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = now.subtract(5 - i, "month");
      return { name: d.format("MMM"), month: d.month(), year: d.year(), amount: 0 };
    });
    completed.forEach((b) => {
      const d = dayjs(b.completed_at ?? b.created_at);
      const slot = months.find(
        (m) => m.month === d.month() && m.year === d.year(),
      );
      if (slot) slot.amount += amt(b.amount);
    });
    return months.map(({ name, amount }) => ({ name, amount: Math.round(amount * 100) / 100 }));
  }, [completed]);

  /* ── Pie data ─────────────────────────────────────────────── */
  const pieData = useMemo(() => {
    const other = bookings.length - completed.length - cancelled.length;
    return [
      { name: "Completed", value: completed.length, color: "#22c55e" },
      { name: "Cancelled", value: cancelled.length, color: "#ef4444" },
      ...(other > 0
        ? [{ name: "In Progress", value: other, color: "#795FF4" }]
        : []),
    ].filter((d) => d.value > 0);
  }, [bookings, completed, cancelled]);

  /* ── Transaction table data ───────────────────────────────── */
  const tableRows = useMemo(
    () =>
      [...bookings]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .map((b) => {
          const gross = amt(b.amount);
          const fee = gross * COMMISSION_RATE;
          const net = gross - fee;
          return { ...b, gross, fee, net };
        }),
    [bookings],
  );
  const paginatedRows = tableRows.slice(
    (txPage - 1) * TX_PER_PAGE,
    txPage * TX_PER_PAGE,
  );
  const totalPages = Math.max(1, Math.ceil(tableRows.length / TX_PER_PAGE));

  /* ── CSV export ───────────────────────────────────────────── */
  const exportCSV = () => {
    const header = [
      "Date",
      "Customer",
      "Service",
      "Amount",
      "Platform Fee (10%)",
      "Net Payout",
      "Status",
    ];
    const rows = tableRows.map((r) => [
      dayjs(r.created_at).format("YYYY-MM-DD"),
      r.customer?.name ?? "—",
      r.listing?.title ?? "—",
      `$${r.gross.toFixed(2)}`,
      `$${r.fee.toFixed(2)}`,
      `$${r.net.toFixed(2)}`,
      r.status,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `earnings-${dayjs().format("YYYY-MM-DD")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Payout ───────────────────────────────────────────────── */
  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payoutAmount);
    if (!amount || amount < 20) {
      toast.error("Minimum payout amount is $20");
      return;
    }
    setRequestingPayout(true);
    try {
      const res = await EarningsService.requestPayout(amount);
      if (res.success || res.data?.success) {
        toast.success("Payout processed successfully");
        setPayoutAmount("");
        await loadData();
      } else {
        toast.error(res.message ?? res.data?.message ?? "Payout failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Payout failed");
    } finally {
      setRequestingPayout(false);
    }
  };

  const handleConnectAccount = async () => {
    setConnectingAccount(true);
    try {
      const res = await EarningsService.createConnectedAccount();
      if (res.data?.success) {
        const accountId = res.data.data?.accountId;
        if (accountId) {
          setGettingLink(true);
          const linkRes = await EarningsService.getOnboardingLink(accountId);
          if (linkRes.data?.success && linkRes.data.data?.url) {
            window.location.href = linkRes.data.data.url;
          }
          setGettingLink(false);
        }
      } else {
        toast.error(res.data?.message ?? "Failed to create account");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create payout account");
    } finally {
      setConnectingAccount(false);
    }
  };

  const handleGetOnboardingLink = async () => {
    if (!accountInfo?.accountId) return;
    setGettingLink(true);
    try {
      const res = await EarningsService.getOnboardingLink(accountInfo.accountId);
      if (res.data?.success && res.data.data?.url)
        window.location.href = res.data.data.url;
    } catch {
      toast.error("Could not retrieve onboarding link");
    } finally {
      setGettingLink(false);
    }
  };

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Earnings
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Analytics and payout management
              </p>
            </div>
          </div>
          <button
            onClick={exportCSV}
            disabled={tableRows.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* ── Summary cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            loading={loading}
            icon={<DollarSign className="w-5 h-5 text-white" />}
            label="Total Earned"
            value={`$${totalEarned.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="All time gross"
          />
          <SummaryCard
            loading={loading}
            icon={<TrendingUp className="w-5 h-5 text-white" />}
            label="This Month"
            value={`$${thisMonthEarned.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={dayjs().format("MMMM YYYY")}
          />
          <SummaryCard
            loading={loading}
            icon={<Clock className="w-5 h-5 text-white" />}
            label="Pending Payouts"
            value={`$${pendingPayouts.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="Net after 10% fee"
          />
          <SummaryCard
            loading={loading}
            icon={<CheckCircle2 className="w-5 h-5 text-white" />}
            label="Completed Bookings"
            value={String(completed.length)}
            sub={`${pending.length} in progress`}
          />
        </div>

        {/* ── Charts row ─────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-5">

          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">
              Monthly Earnings
            </h2>
            <p className="text-xs text-gray-400 mb-5">Last 6 months · gross revenue</p>
            {loading ? (
              <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    barCategoryGap="30%"
                  >
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#795FF4" stopOpacity={1} />
                        <stop offset="100%" stopColor="#9F7AEA" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickFormatter={(v) => `$${v}`}
                      width={48}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(121,95,244,0.06)" }} />
                    <Bar dataKey="amount" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Booking breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">
              Booking Breakdown
            </h2>
            <p className="text-xs text-gray-400 mb-4">All time status distribution</p>

            {loading ? (
              <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
            ) : bookings.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                No bookings yet
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [value, name]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Stats below donut */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Avg. Booking Value</p>
                <p className="font-bold text-gray-900 dark:text-white text-sm">
                  ${avgBookingValue.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Success Rate</p>
                <p className="font-bold text-gray-900 dark:text-white text-sm">
                  {bookings.length
                    ? Math.round((completed.length / bookings.length) * 100)
                    : 0}
                  %
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Transaction history ─────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Transaction History
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                10% platform fee applied · {tableRows.length} total bookings
              </p>
            </div>
          </div>

          {loading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 px-6 py-4 animate-pulse">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                </div>
              ))}
            </div>
          ) : tableRows.length === 0 ? (
            <div className="py-16 text-center">
              <DollarSign className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400">No bookings yet</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700">
                      {[
                        "Date",
                        "Customer",
                        "Service",
                        "Gross",
                        "Platform Fee",
                        "Net Payout",
                        "Status",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {paginatedRows.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition"
                      >
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {dayjs(row.created_at).format("MMM D, YYYY")}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {row.customer?.name ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 max-w-[160px] truncate">
                          {row.listing?.title ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                          ${row.gross.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-red-500 whitespace-nowrap">
                          −${row.fee.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                          ${row.net.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={cn(
                              "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize",
                              row.status === "COMPLETED"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : row.status === "CANCELLED" || row.status === "REJECTED"
                                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                : row.status === "IN_PROGRESS"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                            )}
                          >
                            {row.status.replace("_", " ").toLowerCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500">
                  <span>
                    {(txPage - 1) * TX_PER_PAGE + 1}–
                    {Math.min(txPage * TX_PER_PAGE, tableRows.length)} of{" "}
                    {tableRows.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                      disabled={txPage === 1}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalPages ||
                          Math.abs(p - txPage) <= 1,
                      )
                      .reduce<(number | "…")[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1)
                          acc.push("…");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "…" ? (
                          <span key={`ell-${i}`} className="px-2 py-1.5 text-gray-400">
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setTxPage(p as number)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg border transition",
                              txPage === p
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700",
                            )}
                          >
                            {p}
                          </button>
                        ),
                      )}
                    <button
                      onClick={() => setTxPage((p) => Math.min(totalPages, p + 1))}
                      disabled={txPage === totalPages}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Payout section ──────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Payout</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Transfer earnings to your bank via Stripe
              </p>
            </div>
            {accountInfo?.hasConnectedAccount && (
              <button
                onClick={refreshStripeBalance}
                disabled={loadingBalance}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-400"
                title="Refresh balance"
              >
                <RefreshCw className={cn("w-4 h-4", loadingBalance && "animate-spin")} />
              </button>
            )}
          </div>

          <div className="p-6">
            {!accountInfo?.hasConnectedAccount ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      No payout account connected
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Connect a Stripe account to receive payouts directly to your bank.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleConnectAccount}
                  disabled={connectingAccount || gettingLink}
                  className="gradient-bg text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                >
                  {(connectingAccount || gettingLink) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Connect Stripe Account
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-6">
                {/* Account status */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Stripe account connected
                    </span>
                  </div>
                  {stripeBalance && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Available</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          ${stripeBalance.available.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Pending</span>
                        <span className="text-gray-600 dark:text-gray-400">
                          ${stripeBalance.pending.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleGetOnboardingLink}
                    disabled={gettingLink}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Update payout details
                  </button>
                </div>

                {/* Request payout */}
                <form onSubmit={handleRequestPayout} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Payout Amount (USD · min $20)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min="20"
                        step="0.01"
                        placeholder="0.00"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                  {pendingPayouts > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPayoutAmount(
                          Math.floor(pendingPayouts * 100) / 100 + "",
                        )
                      }
                      className="text-xs text-primary hover:opacity-80 transition"
                    >
                      Request full pending payout (${pendingPayouts.toFixed(2)})
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={requestingPayout || !payoutAmount}
                    className="w-full py-2.5 gradient-bg text-white text-sm font-medium rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {requestingPayout && <Loader2 className="w-4 h-4 animate-spin" />}
                    <ArrowUpCircle className="w-4 h-4" />
                    {requestingPayout ? "Processing…" : "Request Payout"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
