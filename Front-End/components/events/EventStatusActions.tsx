"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { toast } from "react-toastify";
import { EventsService } from "@/service/events/events.service";
import { cn } from "@/lib/utils";

export type EventAction = "IN_PROGRESS" | "COMPLETED" | "CANCEL";

/**
 * What the planner can do next. Mirrors the transitions the API allows
 * (PLANNING/CONFIRMED -> IN_PROGRESS -> COMPLETED, cancel any time before completion).
 */
export function eventActionsFor(status: string): EventAction[] {
  switch (status) {
    case "PLANNING":
    case "CONFIRMED":
      return ["IN_PROGRESS", "CANCEL"];
    case "IN_PROGRESS":
      return ["COMPLETED", "CANCEL"];
    default:
      return [];
  }
}

/** The planner can edit details until the event is completed or cancelled. */
export const canEditEvent = (status: string) => status !== "CANCELLED" && status !== "COMPLETED";

export const CANCEL_EVENT_MESSAGE =
  "The event will be marked cancelled. After that its details can't be edited and it can't be reopened. Your vendor bookings are not cancelled with it: they stay as they are and vendors are not told. Cancel each booking you no longer need from its own booking page.";

const COMPLETE_EVENT_MESSAGE =
  "The event will be marked completed and can't be moved back to planning or in progress.";

type Confirming = null | "COMPLETED" | "CANCEL";

export default function EventStatusActions({
  eventId,
  eventName,
  status,
  onUpdated,
  onCancelled,
}: {
  eventId: string;
  eventName: string;
  status: string;
  /** Called with the updated event after a status change. */
  onUpdated: (event: Record<string, unknown>) => void;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState<EventAction | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const actions = eventActionsFor(status);

  const setStatus = async (next: "IN_PROGRESS" | "COMPLETED") => {
    setBusy(next);
    try {
      const res = await EventsService.update(eventId, { status: next });
      if (res.data?.success) {
        toast.success(next === "COMPLETED" ? "Event marked completed" : "Event marked in progress");
        onUpdated(res.data.data);
      } else {
        toast.error(res.data?.message || "Could not update the event");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not update the event");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const cancel = async () => {
    setBusy("CANCEL");
    try {
      const res = await EventsService.cancel(eventId);
      if (res.data?.success) {
        toast.success("Event cancelled");
        onCancelled();
      } else {
        toast.error(res.data?.message || "Failed to cancel event");
      }
    } catch {
      toast.error("Failed to cancel event");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  if (actions.length === 0) return null;

  return (
    <>
      {actions.includes("IN_PROGRESS") && (
        <button
          type="button"
          onClick={() => setStatus("IN_PROGRESS")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-60"
        >
          {busy === "IN_PROGRESS" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Mark in progress
        </button>
      )}
      {actions.includes("COMPLETED") && (
        <button
          type="button"
          onClick={() => setConfirming("COMPLETED")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-60"
        >
          {busy === "COMPLETED" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Mark completed
        </button>
      )}
      {actions.includes("CANCEL") && (
        <button
          type="button"
          onClick={() => setConfirming("CANCEL")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-60"
        >
          {busy === "CANCEL" ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
          Cancel Event
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming === "CANCEL" ? `Cancel “${eventName}”?` : `Mark “${eventName}” completed?`}
          message={confirming === "CANCEL" ? CANCEL_EVENT_MESSAGE : COMPLETE_EVENT_MESSAGE}
          confirmLabel={confirming === "CANCEL" ? "Cancel event" : "Mark completed"}
          dismissLabel={confirming === "CANCEL" ? "Keep event" : "Not yet"}
          destructive={confirming === "CANCEL"}
          busy={busy !== null}
          onConfirm={() => (confirming === "CANCEL" ? cancel() : setStatus("COMPLETED"))}
          onDismiss={() => setConfirming(null)}
        />
      )}
    </>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  dismissLabel,
  destructive,
  busy,
  onConfirm,
  onDismiss,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  dismissLabel: string;
  destructive?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !busy && onDismiss()} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="event-confirm-title"
        aria-describedby="event-confirm-message"
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 z-10"
      >
        <h2 id="event-confirm-title" className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>
        <p id="event-confirm-message" className="text-sm text-gray-600 dark:text-gray-300">
          {message}
        </p>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            autoFocus
            onClick={onDismiss}
            disabled={busy}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition dark:hover:bg-gray-700 dark:text-gray-200 dark:border-gray-700 disabled:opacity-60"
          >
            {dismissLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "flex-1 px-4 py-3 rounded-xl font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2",
              destructive ? "bg-red-600 text-white hover:bg-red-700" : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown on a completed event. There is no completed-at column, so the date is the event's last
 * update (the status change), which details edits can no longer move once it is completed.
 */
export function EventCompletedBanner({
  completedAt,
  hasBookings,
  onViewVendors,
}: {
  completedAt?: string;
  hasBookings: boolean;
  onViewVendors: () => void;
}) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20 p-5 mb-6 flex flex-wrap items-start gap-4"
    >
      <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
      <div className="flex-1 min-w-[12rem]">
        <p className="font-semibold text-green-800 dark:text-green-300">
          {completedAt ? `Completed on ${dayjs(completedAt).format("MMM D, YYYY")}` : "Completed"}
        </p>
        {hasBookings && (
          <p className="text-sm text-green-700 dark:text-green-400 mt-1">
            How did your vendors do? You can leave a review for each completed booking from My Bookings.
          </p>
        )}
      </div>
      {hasBookings && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onViewVendors}
            className="px-4 py-2 rounded-xl border border-green-300 dark:border-green-800 text-sm font-medium text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition"
          >
            View vendors
          </button>
          <Link
            href="/bookings"
            className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition"
          >
            Review vendors
          </Link>
        </div>
      )}
    </div>
  );
}
