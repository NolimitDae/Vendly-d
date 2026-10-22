"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { BadgeCheck, Clock, IdCard, Loader2, Repeat, ShieldAlert } from "lucide-react";
import { IdentityService, RolesInfo, SwitchableRole } from "@/service/identity/identity.service";
import { saveSession } from "@/lib/session";
import { hardNavigate } from "@/lib/navigate";
import { homeFor, ROLE_BLURB, ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

/**
 * One login, several roles: shows the roles this account holds and switches between them.
 * Switching or adding a role needs an approved ID check.
 */
export default function AccountRoles() {
  const [info, setInfo] = useState<RolesInfo | null>(null);
  const [busy, setBusy] = useState<SwitchableRole | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);

  useEffect(() => {
    IdentityService.roles()
      .then((res) => res.data?.success && setInfo(res.data.data))
      .catch(() => {});
  }, []);

  if (!info || !info.active) return null; // admins and loading

  const id = info.id_verification;
  const verified = id.verified;

  const doSwitch = async (role: SwitchableRole) => {
    if (role === "VENDOR" && !info.roles.includes("VENDOR") && !addingVendor) {
      setAddingVendor(true);
      return;
    }
    setBusy(role);
    try {
      const res = await IdentityService.switchRole(role, role === "VENDOR" ? businessName.trim() || undefined : undefined);
      const auth = res.data?.authorization;
      if (!res.data?.success) throw new Error(res.data?.message);
      // fresh tokens when issued; the current session already carries the new role either way
      if (auth?.access_token) saveSession(auth.access_token, auth.refresh_token);
      toast.success(res.data.added ? res.data.message : `Switched to ${ROLE_LABEL[role]}`);
      // full reload so the menus and pages pick up the new role
      hardNavigate(homeFor(res.data.type ?? role));
    } catch (e) {
      toast.error(apiMessage(e, "Couldn't switch roles. Please try again."));
      setBusy(null);
    }
  };

  return (
    <div id="roles" className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden scroll-mt-24">
      <div className="flex items-center gap-3 p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
          <Repeat className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Your roles</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Use one login as a customer, vendor and planner.</p>
        </div>
      </div>

      {!verified && (
        <div
          className={cn(
            "flex items-start gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700",
            id.status === "REJECTED" ? "bg-red-50 dark:bg-red-900/20" : "bg-amber-50 dark:bg-amber-900/10",
          )}
        >
          {id.status === "PENDING" ? (
            <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          ) : id.status === "REJECTED" ? (
            <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          ) : (
            <IdCard className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 text-sm">
            {id.status === "PENDING" ? (
              <p className="text-gray-700 dark:text-gray-200">
                We&apos;re reviewing your ID, usually within one business day. You can switch roles once it&apos;s approved.
              </p>
            ) : id.status === "REJECTED" ? (
              <p className="text-gray-700 dark:text-gray-200">
                We couldn&apos;t verify your ID{id.rejection_reason ? `: ${id.rejection_reason}` : "."}
              </p>
            ) : (
              <p className="text-gray-700 dark:text-gray-200">To keep everyone safe, verify your ID before switching or adding a role.</p>
            )}
            {id.status !== "PENDING" && (
              <Link href="/settings/verify-id" className="inline-block mt-2 font-semibold text-primary hover:underline">
                {id.status === "REJECTED" ? "Upload new photos" : "Verify my ID"}
              </Link>
            )}
          </div>
        </div>
      )}

      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {info.available.map((role) => {
          const current = info.active === role;
          const held = info.roles.includes(role);
          return (
            <li key={role} className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4">
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  {ROLE_LABEL[role]}
                  {current && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                      <BadgeCheck className="w-3.5 h-3.5" /> In use
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{ROLE_BLURB[role]}</p>
                {role === "VENDOR" && addingVendor && !held && (
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Business name (optional)"
                    aria-label="Business name"
                    maxLength={255}
                    className="mt-3 w-full sm:w-72 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>
              {!current && (
                <button
                  type="button"
                  onClick={() => doSwitch(role)}
                  disabled={!verified || busy !== null}
                  title={verified ? undefined : "Verify your ID first"}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-primary flex items-center justify-center gap-2"
                >
                  {busy === role && <Loader2 className="w-4 h-4 animate-spin" />}
                  {held ? `Switch to ${ROLE_LABEL[role].toLowerCase()}` : role === "VENDOR" && addingVendor ? "Become a vendor" : `Add ${ROLE_LABEL[role].toLowerCase()}`}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {info.roles.includes("VENDOR") || addingVendor ? (
        <p className="px-6 pb-4 text-xs text-gray-400">New vendors still upload a business licence for approval before their services go live.</p>
      ) : null}
    </div>
  );
}
