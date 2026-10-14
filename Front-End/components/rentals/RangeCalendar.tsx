"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayKey } from "@/service/rentals/rentals.service";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const same = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();

/**
 * Pickup → return picker. First click sets pickup, second sets return (a sold-out day in between
 * is refused via `onBlocked`). `free(d)` gives units free that day; 0 crosses the day out.
 */
export default function RangeCalendar({
  start,
  end,
  onChange,
  free,
  total,
  onBlocked,
}: {
  start: Date | null;
  end: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  free: (d: Date) => number;
  total: number;
  onBlocked?: (d: Date) => void;
}) {
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(new Date((start ?? today).getFullYear(), (start ?? today).getMonth(), 1));
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(month, i - month.getDay())), [month]);
  const atFirst = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  const pick = (d: Date) => {
    if (!start || end || d < start) return onChange(d, null);
    for (let x = start; x <= d; x = addDays(x, 1)) {
      if (free(x) < 1) return onBlocked?.(x);
    }
    onChange(start, d);
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button type="button" aria-label="Previous month" disabled={atFirst} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center disabled:opacity-30">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="font-medium text-gray-900 dark:text-white">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d) => {
          const outside = d.getMonth() !== month.getMonth() || d < today;
          const n = free(d);
          const blocked = !outside && n < 1;
          const edge = same(d, start) || same(d, end);
          const inside = !!start && !!end && d > start && d < end;
          const label = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
          return (
            <button
              type="button"
              key={dayKey(d)}
              disabled={outside || blocked}
              onClick={() => pick(d)}
              aria-label={`${label}${blocked ? ", sold out" : n < total ? `, ${n} left` : ""}`}
              aria-pressed={edge || inside}
              className={cn(
                "relative h-12 flex flex-col items-center justify-start pt-1.5 text-sm transition",
                outside && "text-gray-300 dark:text-gray-600",
                blocked && "text-gray-300 dark:text-gray-600 line-through",
              )}
            >
              {inside && <span className="absolute inset-x-0 top-1.5 h-9 bg-primary/15" />}
              {edge && start && end && !same(start, end) && <span className={cn("absolute top-1.5 h-9 bg-primary/15", same(d, start) ? "left-1/2 right-0" : "left-0 right-1/2")} />}
              <span className={cn("relative w-9 h-9 rounded-full flex items-center justify-center", edge ? "bg-primary text-primary-foreground font-semibold" : !outside && !blocked && "hover:bg-gray-100 dark:hover:bg-gray-700")}>
                {d.getDate()}
              </span>
              {!outside && !blocked && n < total && <span className="absolute bottom-0 text-[10px] leading-none text-gray-400">{n} left</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
