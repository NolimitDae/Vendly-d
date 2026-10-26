"use client";

import { useEffect, useState } from "react";
import { Copy, FlaskConical, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import LocationField, { type PickedPlace } from "@/components/listing/LocationField";
import { TestDataService, type TestDataCreated, type TestDataRemoved, type TestDataStatus } from "@/service/admin/test-data.service";

const err = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/**
 * Admin → Settings → Test vendors: demo vendors and packages for every service category, so the
 * owner can try Vendly end to end. Nothing is made until "Create test vendors" is pressed.
 */
export default function TestVendorsCard() {
  const [status, setStatus] = useState<TestDataStatus | null>(null);
  const [near, setNear] = useState<PickedPlace>({ label: "" });
  const [busy, setBusy] = useState<"create" | "reset" | "remove" | null>(null);
  const [created, setCreated] = useState<TestDataCreated | null>(null);
  const [removed, setRemoved] = useState<TestDataRemoved | null>(null);

  const load = () =>
    TestDataService.status()
      .then((r) => setStatus(r.data?.data ?? null))
      .catch(() => setStatus(null));

  useEffect(() => {
    load();
  }, []);

  const vendors = status?.counts.vendors ?? 0;

  const create = async (reset = false) => {
    const label = near.label.trim();
    if (!reset && !label) return toast.error("Enter where the test vendors should be, like Atlanta, GA.");
    setBusy(reset ? "reset" : "create");
    setRemoved(null);
    try {
      const body = {
        ...(label ? { near: label } : {}),
        ...(label && near.lat != null && near.lng != null ? { lat: near.lat, lng: near.lng } : {}),
        ...(reset ? { reset_password: true } : {}),
      };
      const res = await TestDataService.create(body);
      setCreated(res.data?.data ?? null);
      toast.success(res.data?.message ?? "Test vendors are ready.");
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't create the test vendors"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm("Remove every test vendor? Their open bookings are cancelled and refunded, their packages are taken down, any leftover balance is wiped and the accounts are deleted.")) return;
    setBusy("remove");
    setCreated(null);
    try {
      const res = await TestDataService.remove();
      setRemoved(res.data?.data ?? null);
      toast.success(res.data?.message ?? "Test vendors removed.");
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't remove the test vendors"));
    } finally {
      setBusy(null);
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

  const accounts = created?.accounts ?? status?.accounts ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-gray-100 dark:border-gray-700 p-4" aria-labelledby="test-vendors-title">
      <div className="flex items-start gap-3">
        <FlaskConical className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <h3 id="test-vendors-title" className="font-semibold text-gray-900 dark:text-white">
            Test vendors
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Demo vendors and packages for every service category, so you can try Vendly end to end. Everyone sees them in search with a “Test” badge, and
            you can sign in as each one. Remove them before launch.
          </p>
          <p className="text-sm text-gray-900 dark:text-white" aria-live="polite">
            {status == null
              ? "Loading…"
              : vendors
                ? `${vendors} test vendor${vendors === 1 ? "" : "s"} with ${status.counts.packages} live package${status.counts.packages === 1 ? "" : "s"}.`
                : "No test vendors yet."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="test-vendors-near" className="block text-sm text-gray-600 dark:text-gray-300">
          Near
        </label>
        <LocationField value={near} onChange={setNear} label="Near" inputId="test-vendors-near" />
        <p className="text-xs text-gray-500 dark:text-gray-400">The test vendors are placed a few miles around this place, in its time zone.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => create(false)}
          disabled={!!busy}
          className="px-5 h-11 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-60 flex items-center gap-2"
        >
          {busy === "create" && <Loader2 className="w-4 h-4 animate-spin" />}
          Create test vendors
        </button>
        {vendors > 0 && (
          <button
            type="button"
            onClick={() => create(true)}
            disabled={!!busy}
            className="px-5 h-11 rounded-full border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white disabled:opacity-60 flex items-center gap-2"
          >
            {busy === "reset" ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Reset password
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={!!busy || vendors === 0}
          className="px-5 h-11 rounded-full border border-red-200 dark:border-red-900 text-sm text-red-600 dark:text-red-400 disabled:opacity-50 flex items-center gap-2"
        >
          {busy === "remove" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Remove test vendors
        </button>
      </div>
      {busy === "create" && <p className="text-xs text-gray-500 dark:text-gray-400">This takes up to a minute: every package gets its photos and contract.</p>}

      {created && (
        <div className="space-y-2 rounded-xl bg-white dark:bg-gray-800 p-4">
          {created.password ? (
            <div className="space-y-1">
              <p className="text-sm text-gray-600 dark:text-gray-300">Password for every test vendor</p>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-base" data-testid="test-vendors-password">
                  {created.password}
                </code>
                <button type="button" onClick={() => copy(created.password!, "Password")} aria-label="Copy password" className="text-primary">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
          <p className="text-sm text-gray-900 dark:text-white">{created.password_note}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Made now: {created.created.vendors_created} vendors, {created.created.packages_created} packages, {created.created.add_ons_created} add-ons and fees
            {created.created.rental_items_created ? `, ${created.created.rental_items_created} rental items` : ""}. Time zone {created.timezone}.
          </p>
          {created.skipped.map((s) => (
            <p key={s.email} className="text-xs text-red-600 dark:text-red-400">
              {s.email}: {s.reason}
            </p>
          ))}
        </div>
      )}

      {removed && (
        <div className="space-y-2 rounded-xl bg-white dark:bg-gray-800 p-4 text-sm text-gray-900 dark:text-white">
          <p>
            Removed {removed.counts.removed} test vendor{removed.counts.removed === 1 ? "" : "s"}.
            {removed.counts.cancelled ? ` Cancelled ${removed.counts.cancelled} open booking${removed.counts.cancelled === 1 ? "" : "s"} (refunds go out as usual).` : ""}
          </p>
          {removed.cancelled.map((c) => (
            <p key={c.booking_id} className="text-xs text-gray-500 dark:text-gray-400">
              Cancelled {c.package ?? "a booking"} ({c.booking_id}){c.refunded ? `: $${c.refunded.toFixed(2)} refunded` : ""}
            </p>
          ))}
          {removed.wiped?.map((w) => (
            <p key={w.email ?? w.amount} className="text-xs text-gray-500 dark:text-gray-400">
              Wiped {w.email}&apos;s balance of ${w.amount.toFixed(2)}
            </p>
          ))}
          {removed.not_cancelled.map((c) => (
            <p key={c.booking_id} className="text-xs text-red-600 dark:text-red-400">
              Not cancelled: {c.package ?? "a booking"} ({c.booking_id}). {c.reason}
            </p>
          ))}
          {removed.kept.map((k) => (
            <p key={k.email ?? k.reason} className="text-xs text-red-600 dark:text-red-400">
              Kept {k.email}: {k.reason}
            </p>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <details className="rounded-xl border border-gray-100 dark:border-gray-700">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">Test vendor sign-ins ({accounts.length})</summary>
          <div className="flex justify-end px-4">
            <button type="button" onClick={() => copy(accounts.map((a) => a.email).join("\n"), "Emails")} className="text-xs text-primary flex items-center gap-1">
              <Copy className="w-3.5 h-3.5" /> Copy all emails
            </button>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {accounts.map((a) => (
              <li key={a.email} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-gray-900 dark:text-white">{a.business_name}</span>
                <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{a.email}</span>
                {a.shop_url && (
                  <a href={a.shop_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                    Shop
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
