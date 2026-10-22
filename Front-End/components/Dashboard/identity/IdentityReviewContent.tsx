"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { AdminIdentityService, IdStatus } from "@/service/identity/identity.service";
import { ROLE_LABEL } from "@/lib/roles";

interface Row {
  id: string;
  status: IdStatus;
  document_type: string;
  legal_name: string;
  created_at: string;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  user: { id: string; name?: string | null; email: string; type?: string | null; roles?: string[] };
}
interface Detail extends Row {
  front_url: string | null;
  back_url: string | null;
  selfie_url: string | null;
}

const DOC_LABEL: Record<string, string> = {
  DRIVERS_LICENSE: "Driver's licence",
  STATE_ID: "State ID",
  NATIONAL_ID: "National ID",
  PASSPORT: "Passport",
};
const TABS: { value: Exclude<IdStatus, "NONE">; label: string }[] = [
  { value: "PENDING", label: "Waiting" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

/** Admin queue of ID checks: compare the ID photo with the selfie and the name, then approve or reject. */
export default function IdentityReviewContent() {
  const [tab, setTab] = useState<Exclude<IdStatus, "NONE">>("PENDING");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Detail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await AdminIdentityService.list(tab);
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOpen(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const view = async (id: string) => {
    setOpening(id);
    try {
      const res = await AdminIdentityService.get(id);
      setOpen(res.data?.data ?? null);
      setReason("");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn't open this check");
    } finally {
      setOpening(null);
    }
  };

  const decide = async (status: "APPROVED" | "REJECTED") => {
    if (!open) return;
    if (status === "REJECTED" && reason.trim().length < 5) return toast.error("Tell the user what to fix (they see this)");
    setBusy(true);
    try {
      await AdminIdentityService.review(open.id, status, status === "REJECTED" ? reason.trim() : undefined);
      toast.success(status === "APPROVED" ? "Approved; the user can now switch roles" : "Rejected; the user was told why");
      setOpen(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn't save the decision");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === t.value ? "bg-primary text-primary-foreground" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">{tab === "PENDING" ? "No ID checks waiting." : "Nothing here yet."}</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{r.legal_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Account: {r.user.name ?? "—"} ({r.user.email}) · {(r.user.roles ?? []).map((x) => ROLE_LABEL[x] ?? x).join(", ") || ROLE_LABEL[r.user.type ?? ""]}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>{DOC_LABEL[r.document_type] ?? r.document_type}</p>
                <p>Sent {dayjs(r.created_at).format("MMM D, YYYY h:mm A")}</p>
                {r.reviewed_at && <p>Reviewed {dayjs(r.reviewed_at).format("MMM D, YYYY")}</p>}
              </div>
            </div>
            {r.rejection_reason && <p className="text-xs text-red-500">Rejected: {r.rejection_reason}</p>}

            {open?.id === r.id ? (
              <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {([
                    ["Front", open.front_url],
                    ["Back", open.back_url],
                    ["Selfie", open.selfie_url],
                  ] as const).map(([label, url]) =>
                    url ? (
                      <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="block">
                        <p className="text-xs text-gray-500 mb-1">{label} (opens full size)</p>
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed link */}
                        <img src={url} alt={`${label} of ID check for ${r.legal_name}`} className="w-full aspect-[4/3] object-contain rounded-lg bg-gray-100 dark:bg-gray-900" />
                      </a>
                    ) : null,
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Check the name matches, the ID isn&apos;t expired or edited, and the selfie is the same person. Image links expire after 5 minutes; reopen to refresh.
                </p>
                {tab === "PENDING" && (
                  <>
                    <textarea
                      aria-label="Reason if rejecting"
                      rows={2}
                      placeholder="If rejecting: what should they fix? (they see this)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setOpen(null)} className="px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm">Close</button>
                      <button onClick={() => decide("REJECTED")} disabled={busy} className="px-4 py-2 rounded-full border border-red-300 text-red-600 text-sm font-semibold disabled:opacity-60">Reject</button>
                      <button onClick={() => decide("APPROVED")} disabled={busy} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">Approve</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button onClick={() => view(r.id)} disabled={opening === r.id} className="text-sm font-semibold text-primary flex items-center gap-2">
                {opening === r.id && <Loader2 className="w-4 h-4 animate-spin" />}
                {tab === "PENDING" ? "Review" : "View photos"}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
