"use client";

import dayjs from "dayjs";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackerSteps, type TrackerFields } from "@/lib/booking-tracker";

const when = (iso: string) => (dayjs(iso).isSame(dayjs(), "day") ? dayjs(iso).format("h:mm A") : dayjs(iso).format("MMM D, h:mm A"));

/** The customer's step-by-step tracker for an accepted booking, with the time each step happened. */
export default function BookingProgress({ booking }: { booking: TrackerFields }) {
  const steps = trackerSteps(booking);
  const current = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);
  const finished = booking.status === "COMPLETED";

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4" aria-labelledby="booking-progress">
      <h2 id="booking-progress" className="font-semibold text-gray-900 dark:text-white">
        Booking progress
      </h2>
      <ol className="flex">
        {steps.map((s, i) => (
          <li key={s.key} className="flex-1 flex flex-col items-center gap-1.5 text-center" aria-current={i === current ? "step" : undefined}>
            <div className="flex items-center self-stretch">
              <span className={cn("flex-1 h-0.5", i === 0 ? "opacity-0" : s.done ? "bg-primary" : "bg-gray-200 dark:bg-gray-600")} />
              <span className="relative flex items-center justify-center w-6 h-6">
                {/* the step we're at pulses gently, unless the visitor asked for reduced motion */}
                {i === current && !finished && <span className="absolute inset-0 rounded-full bg-primary/30 motion-safe:animate-ping" aria-hidden />}
                <span
                  className={cn(
                    "relative flex items-center justify-center w-5 h-5 rounded-full border-2",
                    s.done ? "bg-primary border-primary text-primary-foreground" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-500",
                  )}
                >
                  {s.done && <Check className="w-3 h-3" aria-hidden />}
                </span>
              </span>
              <span className={cn("flex-1 h-0.5", i === steps.length - 1 ? "opacity-0" : steps[i + 1]?.done ? "bg-primary" : "bg-gray-200 dark:bg-gray-600")} />
            </div>
            <span className={cn("text-xs font-medium", s.done ? "text-gray-900 dark:text-white" : "text-gray-400")}>
              {s.label}
              <span className="sr-only">{s.done ? " (done)" : " (not yet)"}</span>
            </span>
            {s.done && s.at && <span className="text-[11px] text-gray-500 dark:text-gray-400">{when(s.at)}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
