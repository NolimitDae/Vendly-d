"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ArrowLeft, Loader2, Calendar } from "lucide-react";
import { EventsService } from "@/service/events/events.service";
import { toast } from "react-toastify";
import { EventFormFields, eventFormSchema, type EventFormValues } from "@/components/events/EventForm";

export default function NewEventPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema) });

  const onSubmit = async (values: EventFormValues) => {
    setSubmitting(true);
    try {
      const payload: Parameters<typeof EventsService.create>[0] = {
        name: values.name,
        type: values.type || undefined,
        // the picker gives the planner's local time with no zone; send the exact moment
        date: values.date ? new Date(values.date).toISOString() : undefined,
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
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition dark:text-gray-400"
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
          <EventFormFields register={register} control={control} errors={errors} minDate={new Date().toISOString().slice(0, 16)} idPrefix="new-event" />

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
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
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
