"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "react-toastify";
import dayjs from "dayjs";
import { WalletService } from "@/service/wallet/wallet.service";
import { AuthService } from "@/service/auth/auth.service";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────── */
interface AccountInfo {
  hasConnectedAccount: boolean;
  accountId: string | null;
  email: string;
  name: string;
}

interface StripeBalance {
  available: { amount: number; display: string; currency: string };
  pending: { amount: number; display: string; currency: string };
  total: { amount: number; display: string };
}

interface Transaction {
  id: string;
  type?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
  reference_number?: string;
  created_at: string;
}

/* ─── Status badge ───────────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  succeeded: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  failed: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  payout: "Payout",
  booking_payment: "Booking Payment",
};

/* ─── Page ───────────────────────────────────────────────────── */
export default function WalletPage() {
  const [userType, setUserType] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [stripeBalance, setStripeBalance] = useState<StripeBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);

  /* Deposit state */
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositResult, setDepositResult] = useState<{
    payment_intent_id: string;
    client_secret: string;
    amount: number;
  } | null>(null);

  /* Withdraw state */
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  /* Connect account state */
  const [connectingAccount, setConnectingAccount] = useState(false);
  const [gettingLink, setGettingLink] = useState(false);

  /* ─── Load page data ─────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    try {
      const meRes = await AuthService.me();
      if (meRes.data?.success) setUserType(meRes.data.data?.type ?? null);

      const infoRes = await WalletService.getAccountInfo().catch(() => null);
      if (infoRes?.data?.success) setAccountInfo(infoRes.data.data);

      if (infoRes?.data?.data?.hasConnectedAccount) {
        await refreshStripeBalance();
      }

      const txRes = await WalletService.getTransactions().catch(() => null);
      if (txRes?.data?.success) setTransactions(txRes.data.data ?? []);
    } catch {
      // silent
    } finally {
      setLoadingPage(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─── Refresh stripe balance ─────────────────────────────────── */
  const refreshStripeBalance = async () => {
    setLoadingBalance(true);
    try {
      const res = await WalletService.getStripeBalance();
      if (res.data?.success) setStripeBalance(res.data.data);
    } catch {
      // silent — user may not have a connected account
    } finally {
      setLoadingBalance(false);
    }
  };

  /* ─── Deposit ────────────────────────────────────────────────── */
  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid deposit amount");
      return;
    }
    setDepositing(true);
    setDepositResult(null);
    try {
      const res = await WalletService.deposit(amount);
      if (res.data?.success) {
        setDepositResult(res.data.data);
        setDepositAmount("");
        toast.success("Payment intent created — complete the payment below.");
      } else {
        toast.error(res.data?.message ?? "Deposit failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Deposit failed");
    } finally {
      setDepositing(false);
    }
  };

  /* ─── Withdraw ───────────────────────────────────────────────── */
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 20) {
      toast.error("Minimum withdrawal amount is $20");
      return;
    }
    setWithdrawing(true);
    try {
      const res = await WalletService.withdraw(amount);
      if (res.success || res.data?.success) {
        setWithdrawAmount("");
        toast.success("Withdrawal processed successfully");
        await refreshStripeBalance();
        const txRes = await WalletService.getTransactions().catch(() => null);
        if (txRes?.data?.success) setTransactions(txRes.data.data ?? []);
      } else {
        toast.error(res.message ?? res.data?.message ?? "Withdrawal failed");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  /* ─── Connect Stripe account ─────────────────────────────────── */
  const handleConnectAccount = async () => {
    setConnectingAccount(true);
    try {
      const res = await WalletService.createConnectedAccount();
      if (res.data?.success) {
        const accountId = res.data.data?.accountId;
        toast.success("Connected account created. Redirecting to onboarding…");
        if (accountId) {
          setGettingLink(true);
          const linkRes = await WalletService.getOnboardingLink(accountId);
          if (linkRes.data?.success && linkRes.data.data?.url) {
            window.location.href = linkRes.data.data.url;
          }
          setGettingLink(false);
        }
        await loadData();
      } else {
        toast.error(res.data?.message ?? "Failed to create account");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create connected account");
    } finally {
      setConnectingAccount(false);
    }
  };

  const handleGetOnboardingLink = async () => {
    if (!accountInfo?.accountId) return;
    setGettingLink(true);
    try {
      const res = await WalletService.getOnboardingLink(accountInfo.accountId);
      if (res.data?.success && res.data.data?.url) {
        window.location.href = res.data.data.url;
      } else {
        toast.error("Could not get onboarding link");
      }
    } catch {
      toast.error("Could not get onboarding link");
    } finally {
      setGettingLink(false);
    }
  };

  const isVendor = userType === "VENDOR";

  /* ─── Render ─────────────────────────────────────────────────── */
  if (loadingPage) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wallet</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage your funds and transactions
            </p>
          </div>
        </div>

        {/* ── Balance card ───────────────────────────────────── */}
        <div className="gradient-bg rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium mb-1">
                {isVendor ? "Available Balance (Stripe)" : "Wallet Balance"}
              </p>
              {loadingBalance ? (
                <Loader2 className="w-6 h-6 animate-spin text-white/70 mt-2" />
              ) : stripeBalance ? (
                <>
                  <p className="text-4xl font-bold tracking-tight">
                    ${stripeBalance.available.amount.toFixed(2)}
                  </p>
                  <p className="text-white/60 text-sm mt-1">
                    ${stripeBalance.pending.amount.toFixed(2)} pending
                  </p>
                </>
              ) : (
                <>
                  <p className="text-4xl font-bold tracking-tight">—</p>
                  <p className="text-white/60 text-xs mt-1">
                    {isVendor
                      ? "Connect a Stripe account to see your balance"
                      : "Balance updates after deposit confirmation"}
                  </p>
                </>
              )}
            </div>

            {isVendor && accountInfo?.hasConnectedAccount && (
              <button
                onClick={refreshStripeBalance}
                disabled={loadingBalance}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition disabled:opacity-50"
                title="Refresh balance"
              >
                <RefreshCw className={cn("w-4 h-4", loadingBalance && "animate-spin")} />
              </button>
            )}
          </div>

          {isVendor && accountInfo?.hasConnectedAccount && (
            <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-2 text-sm text-white/70">
              <CheckCircle2 className="w-4 h-4 text-green-300" />
              Stripe payout account connected
            </div>
          )}
        </div>

        {/* ── Action cards ──────────────────────────────────── */}
        <div className={cn("grid gap-5", isVendor ? "md:grid-cols-2" : "md:grid-cols-1 max-w-xl")}>

          {/* Deposit */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ArrowDownCircle className="w-5 h-5 text-green-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Add Funds</h2>
            </div>

            {depositResult ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      Payment Intent Created
                    </p>
                    <p className="text-xs text-green-600/70 dark:text-green-500/70 mt-0.5">
                      Amount: ${depositResult.amount.toFixed(2)} USD
                    </p>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Payment Intent ID
                  </p>
                  <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                    {depositResult.payment_intent_id}
                  </p>
                </div>
                <div className="flex items-start gap-1.5 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                    In production, use Stripe.js with the{" "}
                    <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded text-[11px]">
                      client_secret
                    </code>{" "}
                    to confirm the card payment. Your balance updates automatically after confirmation.
                  </p>
                </div>
                <button
                  onClick={() => setDepositResult(null)}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
                >
                  New deposit
                </button>
              </div>
            ) : (
              <form onSubmit={handleDeposit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                      $
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  {[25, 50, 100, 200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDepositAmount(String(preset))}
                      className={cn(
                        "flex-1 py-1.5 text-xs rounded-lg border transition font-medium",
                        depositAmount === String(preset)
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-primary/30",
                      )}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={depositing || !depositAmount}
                  className="w-full py-2.5 gradient-bg text-white text-sm font-medium rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {depositing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {depositing ? "Creating payment…" : "Add Funds"}
                </button>
              </form>
            )}
          </div>

          {/* Withdraw (vendors only) */}
          {isVendor && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpCircle className="w-5 h-5 text-purple-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Withdraw Funds</h2>
              </div>

              {!accountInfo?.hasConnectedAccount ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Connect a Stripe account to receive payouts to your bank.
                    </p>
                  </div>
                  <button
                    onClick={handleConnectAccount}
                    disabled={connectingAccount || gettingLink}
                    className="w-full py-2.5 gradient-bg text-white text-sm font-medium rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {(connectingAccount || gettingLink) && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {connectingAccount
                      ? "Creating account…"
                      : gettingLink
                      ? "Redirecting…"
                      : "Connect Stripe Account"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWithdraw} className="space-y-3">
                  {stripeBalance && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Available:{" "}
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${stripeBalance.available.amount.toFixed(2)}
                      </span>
                    </p>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Amount (USD · min $20)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                        $
                      </span>
                      <input
                        type="number"
                        min="20"
                        step="0.01"
                        placeholder="0.00"
                        value={withdrawAmount}
                        max={stripeBalance?.available.amount ?? undefined}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={withdrawing || !withdrawAmount}
                    className="w-full py-2.5 gradient-bg text-white text-sm font-medium rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {withdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {withdrawing ? "Processing…" : "Withdraw to Bank"}
                  </button>
                  <button
                    type="button"
                    onClick={handleGetOnboardingLink}
                    disabled={gettingLink}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-primary transition py-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Update Stripe payout details
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* ── Transaction history ───────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Transaction History</h2>
            <span className="text-xs text-gray-400">{transactions.length} records</span>
          </div>

          {transactions.length === 0 ? (
            <div className="py-16 text-center">
              <Wallet className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Date
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Type
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Reference
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Amount
                    </th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition"
                    >
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {dayjs(tx.created_at).format("MMM D, YYYY")}
                        <span className="block text-xs text-gray-400">
                          {dayjs(tx.created_at).format("h:mm A")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {tx.type === "withdraw" || tx.type === "payout" ? (
                            <ArrowUpCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          ) : (
                            <ArrowDownCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                          )}
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            {TYPE_LABELS[tx.type ?? ""] ?? (tx.type ?? "—")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-400 max-w-[140px] truncate">
                        {tx.reference_number ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold whitespace-nowrap">
                        <span
                          className={
                            tx.type === "withdraw" || tx.type === "payout"
                              ? "text-red-500"
                              : "text-green-600 dark:text-green-400"
                          }
                        >
                          {tx.type === "withdraw" || tx.type === "payout" ? "−" : "+"}$
                          {Number(tx.amount ?? 0).toFixed(2)}
                        </span>
                        <span className="block text-xs font-normal text-gray-400">
                          {(tx.currency ?? "usd").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={cn(
                            "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize",
                            STATUS_STYLES[tx.status?.toLowerCase() ?? ""] ??
                              "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
                          )}
                        >
                          {tx.status ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
