"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Flag, Loader2, MoreVertical, X } from "lucide-react";
import { toast } from "react-toastify";
import { ChatService, REPORT_REASONS, type ReportReason } from "@/service/chat/chat.service";
import { errorMessage } from "@/service/rentals/rentals.service";
import { cn } from "@/lib/utils";

interface Person {
  id: string;
  name: string;
}

/** Report someone to Vendly: pick a reason, add details if you like, optionally block too. */
export function ReportDialog({
  person,
  conversationId,
  messageId,
  alreadyBlocked,
  onClose,
  onReported,
}: {
  person: Person;
  conversationId: string;
  messageId?: string;
  alreadyBlocked?: boolean;
  onClose: () => void;
  onReported: (alsoBlocked: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(!alreadyBlocked);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return toast.error("Pick a reason");
    setBusy(true);
    try {
      const block = !alreadyBlocked && alsoBlock;
      await ChatService.report({
        reported_id: person.id,
        reason,
        details: details.trim() || undefined,
        conversation_id: conversationId,
        message_id: messageId,
        block: block || undefined,
      });
      toast.success("Thanks. Our team will review this report.");
      onReported(block);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the report"));
    } finally {
      setBusy(false);
    }
  };

  const label = messageId ? "Report message" : `Report ${person.name}`;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <form onSubmit={submit} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{label}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Vendly&apos;s team reviews reports. {person.name} won&apos;t be told who reported them.</p>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">What&apos;s wrong?</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className={cn("flex items-center gap-3 px-3 py-2 rounded-xl border text-sm cursor-pointer", reason === r.value ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700")}>
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              <span className="text-gray-900 dark:text-white">{r.label}</span>
            </label>
          ))}
        </fieldset>
        <textarea
          aria-label="Details (optional)"
          placeholder="Anything else we should know? (optional)"
          rows={3}
          maxLength={2000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {!alreadyBlocked && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
            Also block {person.name}
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={busy || !reason} className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send report
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * The ⋮ menu on a 1:1 chat: block / unblock and report. Blocking stops messages both ways;
 * bookings and contracts carry on.
 */
export default function ChatSafetyMenu({
  person,
  conversationId,
  blockedByMe,
  onBlockedChange,
}: {
  person: Person;
  conversationId: string;
  blockedByMe: boolean;
  onBlockedChange: (blocked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggleBlock = async () => {
    setOpen(false);
    if (!blockedByMe && !confirm(`Block ${person.name}? Neither of you will be able to send messages in this chat. Bookings and contracts aren't affected. You can unblock anytime.`)) return;
    setBusy(true);
    try {
      if (blockedByMe) await ChatService.unblock(person.id);
      else await ChatService.block(person.id);
      onBlockedChange(!blockedByMe);
      toast.success(blockedByMe ? `${person.name} unblocked` : `${person.name} blocked`);
    } catch (err) {
      toast.error(errorMessage(err, blockedByMe ? "Could not unblock" : "Could not block"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Chat options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <MoreVertical className="w-5 h-5" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-48 z-40 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          <button role="menuitem" onClick={toggleBlock} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Ban className="w-4 h-4" /> {blockedByMe ? "Unblock" : "Block"}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setReporting(true);
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Flag className="w-4 h-4" /> Report
          </button>
        </div>
      )}
      {reporting && (
        <ReportDialog
          person={person}
          conversationId={conversationId}
          alreadyBlocked={blockedByMe}
          onClose={() => setReporting(false)}
          onReported={(alsoBlocked) => alsoBlocked && onBlockedChange(true)}
        />
      )}
    </div>
  );
}
