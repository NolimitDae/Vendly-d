"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import { Loader2, X } from "lucide-react";
import { toast } from "react-toastify";
import { EventsService } from "@/service/events/events.service";
import { EventFormFields, eventFormSchema, type EventFormValues } from "./EventForm";

export interface EditableEvent {
  id: string;
  name: string;
  type?: string | null;
  date?: string | null;
  venue?: string | null;
  guest_count?: number | null;
  total_budget?: number | string | null;
  notes?: string | null;
}

export const eventToFormValues = (e: EditableEvent): EventFormValues => ({
  name: e.name ?? "",
  type: e.type ?? "",
  date: e.date ? dayjs(e.date).format("YYYY-MM-DDTHH:mm") : "",
  venue: e.venue ?? "",
  guest_count: e.guest_count ?? "",
  total_budget: e.total_budget != null && e.total_budget !== "" ? Number(e.total_budget) : "",
  notes: e.notes ?? "",
});

/** PATCH body for an edit: a field the planner emptied is sent as null so the API clears it. */
export const formValuesToUpdate = (v: EventFormValues) => ({
  name: v.name.trim(),
  type: v.type || null,
  // the input holds local time; send an absolute instant
  date: v.date ? new Date(v.date).toISOString() : null,
  venue: v.venue?.trim() || null,
  guest_count: v.guest_count !== "" && v.guest_count != null ? Number(v.guest_count) : null,
  total_budget: v.total_budget !== "" && v.total_budget != null ? Number(v.total_budget) : null,
  notes: v.notes?.trim() || null,
});

export default function EditEventDialog({
  event,
  onClose,
  onSaved,
}: {
  event: EditableEvent;
  onClose: () => void;
  onSaved: (updated: Record<string, unknown>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues: eventToFormValues(event) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const onSubmit = async (values: EventFormValues) => {
    setSaving(true);
    try {
      const res = await EventsService.update(event.id, formValuesToUpdate(values));
      if (res.data?.success) {
        toast.success("Event updated");
        onSaved(res.data.data);
        onClose();
      } else {
        toast.error(res.data?.message || "Failed to update event");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !saving && onClose()} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-event-title"
        onSubmit={handleSubmit(onSubmit)}
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 z-10 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 id="edit-event-title" className="text-xl font-bold text-gray-900 dark:text-white">
            Edit event details
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <EventFormFields register={register} control={control} errors={errors} idPrefix="edit-event" />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
