"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/utils";

/** Shared by the create page and the edit dialog on the event detail page. */
export const EVENT_TYPES = [
  { value: "WEDDING", label: "Wedding" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "CONCERT", label: "Concert" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "PRIVATE_PARTY", label: "Private Party" },
  { value: "OTHER", label: "Other" },
] as const;

export const eventFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.string().optional(),
  date: z.string().optional(),
  venue: z.string().optional(),
  guest_count: z.coerce.number().int().min(1).optional().or(z.literal("")),
  total_budget: z.coerce.number().min(0).optional().or(z.literal("")),
  notes: z.string().optional(),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;

export const eventInputClass =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary placeholder-gray-400";

const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5";

/** The event fields (name, type, date, venue, guests, budget, notes) for a react-hook-form form. */
export function EventFormFields({
  register,
  errors,
  minDate,
  idPrefix = "event",
}: {
  register: UseFormRegister<EventFormValues>;
  errors: FieldErrors<EventFormValues>;
  /** The create page stops past dates; editing keeps whatever date the event already has. */
  minDate?: string;
  idPrefix?: string;
}) {
  const id = (f: string) => `${idPrefix}-${f}`;
  return (
    <>
      {/* Name */}
      <div>
        <label htmlFor={id("name")} className={labelClass}>
          Event Name <span className="text-red-500">*</span>
        </label>
        <input
          id={id("name")}
          {...register("name")}
          placeholder="e.g. Sarah & John's Wedding"
          className={cn(eventInputClass, errors.name && "border-red-400 focus:ring-red-400")}
        />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
      </div>

      {/* Type */}
      <div>
        <label htmlFor={id("type")} className={labelClass}>Event Type</label>
        <select id={id("type")} {...register("type")} className={eventInputClass}>
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
        <label htmlFor={id("date")} className={labelClass}>Event Date</label>
        <input id={id("date")} type="datetime-local" {...register("date")} min={minDate} className={eventInputClass} />
      </div>

      {/* Venue */}
      <div>
        <label htmlFor={id("venue")} className={labelClass}>Venue / Location</label>
        <input id={id("venue")} {...register("venue")} placeholder="e.g. Grand Ballroom, New York" className={eventInputClass} />
      </div>

      {/* Guest count + Budget row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={id("guest_count")} className={labelClass}>Guest Count</label>
          <input
            id={id("guest_count")}
            type="number"
            {...register("guest_count")}
            placeholder="100"
            min={1}
            className={cn(eventInputClass, errors.guest_count && "border-red-400")}
          />
          {errors.guest_count && <p className="mt-1 text-xs text-red-500">{errors.guest_count.message as string}</p>}
        </div>
        <div>
          <label htmlFor={id("total_budget")} className={labelClass}>Total Budget ($)</label>
          <input
            id={id("total_budget")}
            type="number"
            step="0.01"
            {...register("total_budget")}
            placeholder="5000"
            min={0}
            className={cn(eventInputClass, errors.total_budget && "border-red-400")}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor={id("notes")} className={labelClass}>Notes</label>
        <textarea
          id={id("notes")}
          {...register("notes")}
          rows={4}
          placeholder="Any additional notes or requirements…"
          className={cn(eventInputClass, "resize-none")}
        />
      </div>
    </>
  );
}
