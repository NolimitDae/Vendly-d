"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { ArrowLeft, Loader2, Calendar } from "lucide-react";
import { EventsService } from "@/service/events/events.service";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  { value: "WEDDING", label: "Wedding" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "CONCERT", label: "Concert" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "PRIVATE_PARTY", label: "Private Party" },
  { value: "OTHER", label: "Other" },
] as const;

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.string().optional(),
  date: z.string().optional(),
  venue: z.string().optional(),
  guest_count: z.coerce.number().int().min(1).optional().or(z.literal("")),
  total_budget: z.coerce.number().min(0).optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary placeholder-gray-400";

const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5";

export default function NewEventPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const payload: Parameters<typeof EventsService.create>[0] = {
        name: values.name,
        type: values.type || undefined,
        date: values.date || undefined,
        venue: values.venue || undefined,
        guest_count: values.guest_count ? Number(values.guest_count) : undefined,
        total_budget: values.total_budget ? Number(values.total_budget) : undefined,
        notes: values.notes || undefined,
      };

      const res = await EventsService.create(payload);
      if (res.data?.success) {
        toast.success("Event created successfully!");
        router.push(`/event-planner/events/${res.data.data.id}`);
      } else {
        toast.error(res.data?.message || "Failed to create event");
      }
    } catch {
      toast.error("Failed to create event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="py-10 sm:py-16 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Back */}
        <Link
          href="/event-planner/events"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Events
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create New Event</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Fill in the details to start planning your event
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-5"
        >
          {/* Name */}
          <div>
            <label className={labelClass}>
              Event Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register("name")}
              placeholder="e.g. Sarah & John's Wedding"
              className={cn(inputClass, errors.name && "border-red-400 focus:ring-red-400")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className={labelClass}>Event Type</label>
            <select {...register("type")} className={inputClass}>
              <option value="">Select a type (optional)</option>
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className={labelClass}>Event Date</label>
            <input
              type="datetime-local"
              {...register("date")}
              min={new Date().toISOString().slice(0, 16)}
              className={inputClass}
            />
          </div>

          {/* Venue */}
          <div>
            <label className={labelClass}>Venue / Location</label>
            <input
              {...register("venue")}
              placeholder="e.g. Grand Ballroom, New York"
              className={inputClass}
            />
          </div>

          {/* Guest count + Budget row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Guest Count</label>
              <input
                type="number"
                {...register("guest_count")}
                placeholder="100"
                min={1}
                className={cn(inputClass, errors.guest_count && "border-red-400")}
              />
              {errors.guest_count && (
                <p className="mt-1 text-xs text-red-500">{errors.guest_count.message as string}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Total Budget ($)</label>
              <input
                type="number"
                step="0.01"
                {...register("total_budget")}
                placeholder="5000"
                min={0}
                className={cn(inputClass, errors.total_budget && "border-red-400")}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              {...register("notes")}
              rows={4}
              placeholder="Any additional notes or requirements…"
              className={cn(inputClass, "resize-none")}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Link
              href="/event-planner/events"
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Creating…" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
