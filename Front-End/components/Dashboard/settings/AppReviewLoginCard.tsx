"use client";

import { useState } from "react";
import { Copy, Loader2, Smartphone } from "lucide-react";
import { toast } from "react-toastify";
import { TestDataService, type ReviewAccount } from "@/service/admin/test-data.service";

/**
 * Admin → Settings → App Review login: the sign-in Apple's reviewer uses (App Store Connect > App Review
 * Information). A test customer that can switch to a vendor profile; each press gives it a new password,
 * shown once.
 */
export default function AppReviewLoginCard() {
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<ReviewAccount | null>(null);

  const make = async () => {
    setBusy(true);
    try {
      const res = await TestDataService.reviewAccount();
      setAccount(res.data?.data ?? null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn't make the App Review login");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.info(text);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-gray-100 dark:border-gray-700 p-5" aria-labelledby="app-review-title">
      <div>
        <h3 id="app-review-title" className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" /> App Review login
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          The sign-in for Apple&apos;s reviewer: a test customer that can switch to a vendor profile. Paste it into App Store Connect under App Review
          Information. Pressing again gives it a new password.
        </p>
      </div>
      <button
        type="button"
        onClick={make}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {account ? "Make a new password" : "Make the App Review login"}
      </button>
      {account && (
        <div className="space-y-2 rounded-xl bg-white dark:bg-gray-800 p-4" data-testid="app-review-login">
          {[
            ["Email", account.email],
            ["Password", account.password],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-sm text-gray-600 dark:text-gray-300">{label}</span>
              <code className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-base">{value}</code>
              <button type="button" onClick={() => copy(value, label)} aria-label={`Copy ${label.toLowerCase()}`} className="text-primary">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          ))}
          <p className="text-xs text-gray-500 dark:text-gray-400">{account.note}</p>
        </div>
      )}
    </section>
  );
}
