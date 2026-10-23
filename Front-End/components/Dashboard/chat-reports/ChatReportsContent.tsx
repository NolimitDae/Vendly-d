"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { ChatReportsService, type ChatReport, type ReportPerson } from "@/service/admin/chat-reports.service";
import { MoneyService } from "@/service/admin/money.service";
import { REPORT_REASONS } from "@/service/chat/chat.service";
import { errorMessage } from "@/service/rentals/rentals.service";

const TABS = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const REASON_LABEL: Record<string, string> = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", ACTIONED: "Actioned", DISMISSED: "Dismissed" };

function Who({ label, p }: { label: string; p: ReportPerson | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-medium text-gray-900 dark:text-white truncate">
        {p?.name ?? "Deleted user"}
        {p?.status === 0 && <span className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Suspended</span>}
      </p>
      {p?.email && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.email}{p.type ? ` · ${p.type.toLowerCase().replace("_", " ")}` : ""}</p>}
    </div>
  );
}

/** Admin queue of people reported from chat: read the conversation, then dismiss or mark actioned. */
export default function ChatReportsContent() {
  const [tab, setTab] = useState<Tab>("open");
  const [rows, setRows] = useState<ChatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showContext, setShowContext] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await ChatReportsService.list(tab);
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const resolve = async (r: ChatReport, action: "dismiss" | "actioned") => {
    setBusy(r.id);
    try {
      await ChatReportsService.resolve(r.id, action, notes[r.id]?.trim() || undefined);
      toast.success(action === "dismiss" ? "Report dismissed" : "Report marked actioned");
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save"));
    } finally {
      setBusy(null);
    }
  };

  // Reuses the existing account-status endpoint (PATCH /admin/users/:id/status).
  const setSuspended = async (p: ReportPerson, suspend: boolean) => {
    if (suspend && !confirm(`Suspend ${p.name ?? "this user"}? They're signed out everywhere and can't sign in until restored.`)) return;
    setBusy(`user:${p.id}`);
    try {
      await MoneyService.setUserStatus(p.id, suspend ? 0 : 1);
      toast.success(suspend ? "Account suspended" : "Account restored");
      setRows((prev) => prev.map((x) => (x.reported?.id === p.id ? { ...x, reported: { ...x.reported, status: suspend ? 0 : 1 } } : x)));
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't change the account"));
    } finally {
      setBusy(null);
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
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">{tab === "open" ? "No open reports." : "Nothing here yet."}</p>
      ) : (
        rows.map((r) => (
          <article key={r.id} aria-label={`Report about ${r.reported?.name ?? "user"}`} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{REASON_LABEL[r.reason] ?? r.reason}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Reported {dayjs(r.created_at).format("MMM D, YYYY h:mm A")}</p>
              </div>
              {r.status !== "OPEN" && (
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                  <p className="font-semibold">{STATUS_LABEL[r.status]}</p>
                  {r.resolved_at && <p>{dayjs(r.resolved_at).format("MMM D, YYYY")}{r.resolved_by?.name ? ` by ${r.resolved_by.name}` : ""}</p>}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Who label="Reported by" p={r.reporter} />
              <Who label="Reported user" p={r.reported} />
            </div>

            {r.details && <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">&ldquo;{r.details}&rdquo;</p>}

            {r.message_id && (
              <div className="rounded-lg border-l-4 border-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Reported message</p>
                {r.message ? (
                  <>
                    {r.message.text && <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{r.message.text}</p>}
                    {r.message.attachments_url?.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline block">Photo</a>
                    ))}
                  </>
                ) : (
                  <p className="text-gray-500 italic">The sender has deleted this message.</p>
                )}
              </div>
            )}

            {r.conversation_id && (
              <div>
                <button onClick={() => setShowContext((s) => ({ ...s, [r.id]: !s[r.id] }))} className="text-sm font-semibold text-primary">
                  {showContext[r.id] ? "Hide conversation" : `Show conversation (${r.context.length})`}
                </button>
                {showContext[r.id] && (
                  <ol className="mt-2 space-y-1.5 rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-sm" aria-label="Conversation before the report">
                    {r.context.length === 0 && <li className="text-gray-500">No messages.</li>}
                    {r.context.map((m) => (
                      <li key={m.id} className={m.id === r.message_id ? "font-semibold text-red-700 dark:text-red-300" : "text-gray-800 dark:text-gray-200"}>
                        <span className="text-xs text-gray-500 mr-2">{dayjs(m.createdAt).format("MMM D h:mm A")}</span>
                        <span className="font-medium">{m.sender?.name ?? "User"}:</span>{" "}
                        {m.kind === "quote" ? `Quote: ${m.quote?.title ?? ""}` : m.text}
                        {m.attachments_url?.length ? <span className="text-xs text-gray-500"> [photo]</span> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {r.resolution_note && <p className="text-xs text-gray-500 dark:text-gray-400">Note: {r.resolution_note}</p>}

            <div className="flex flex-wrap items-end gap-2">
              {r.status === "OPEN" && (
                <>
                  <textarea
                    aria-label="Note"
                    rows={2}
                    placeholder="Note (what you did or why you're dismissing)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                  <button onClick={() => resolve(r, "dismiss")} disabled={busy === r.id} className="px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-60">Dismiss</button>
                  <button onClick={() => resolve(r, "actioned")} disabled={busy === r.id} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">Mark actioned</button>
                </>
              )}
              {r.reported && (
                <button
                  onClick={() => setSuspended(r.reported!, r.reported!.status !== 0)}
                  disabled={busy === `user:${r.reported.id}`}
                  className="px-4 py-2 rounded-full border border-red-300 text-red-600 text-sm font-semibold disabled:opacity-60 sm:ml-auto"
                >
                  {r.reported.status === 0 ? "Restore account" : "Suspend user"}
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
