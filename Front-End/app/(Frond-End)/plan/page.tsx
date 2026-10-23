"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import LocationField, { type PickedPlace } from "@/components/listing/LocationField";
import PlanResults from "@/components/planning/PlanResults";
import { EVENT_TYPES, money } from "@/lib/plan";
import { PlanningService, type ChecklistRequest, type Plan } from "@/service/planning/planning.service";
import { errorMessage } from "@/service/rentals/rentals.service";

const inputClass =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5";

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function PlanPage() {
  const [eventType, setEventType] = useState("WEDDING");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [place, setPlace] = useState<PickedPlace>({ label: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const body: ChecklistRequest = { event_type: eventType };
    if (date) body.date = date;
    if (Number(guests) > 0) body.guest_count = Math.round(Number(guests));
    if (Number(budget) > 0) body.budget = Number(budget);
    if (place.label.trim()) {
      body.location = place.label.trim();
      if (place.lat != null && place.lng != null) {
        body.lat = place.lat;
        body.lng = place.lng;
      }
    }
    try {
      const res = await PlanningService.checklist(body);
      if (res.data?.success) setPlan(res.data.data);
      else setError(res.data?.message || "We couldn't build your checklist. Try again.");
    } catch (err) {
      setError(errorMessage(err, "We couldn't build your checklist. Try again."));
    } finally {
      setLoading(false);
    }
  };

  const typeLabel = EVENT_TYPES.find((t) => t.value === (plan?.event_type ?? eventType))?.label.toLowerCase() ?? "event";

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Plan your event</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Tell us a little about it and we&apos;ll list the services most events like yours book, how to split the budget, when to book, and who on Vendly is free.
          </p>
        </header>

        {/* announced once a checklist arrives, without reading the whole list */}
        <p className="sr-only" aria-live="polite">
          {plan && !loading ? `Checklist ready: ${plan.items.length} ${plan.items.length === 1 ? "service" : "services"}.` : ""}
        </p>

        <form
          onSubmit={submit}
          aria-label="Plan your event"
          className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm sm:grid-cols-2"
        >
          <div>
            <label htmlFor="plan-type" className={labelClass}>Event type</label>
            <select id="plan-type" value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputClass} required>
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="plan-date" className={labelClass}>Date <span className="font-normal text-gray-400">(optional)</span></label>
            <input id="plan-date" type="date" min={todayYmd()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="plan-guests" className={labelClass}>Guests <span className="font-normal text-gray-400">(optional)</span></label>
            <input id="plan-guests" type="number" inputMode="numeric" min={1} max={100000} step={1} placeholder="e.g. 120" value={guests} onChange={(e) => setGuests(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="plan-budget" className={labelClass}>Total budget ($) <span className="font-normal text-gray-400">(optional)</span></label>
            <input id="plan-budget" type="number" inputMode="decimal" min={0} step={50} placeholder="e.g. 25000" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="plan-location" className={labelClass}>Where <span className="font-normal text-gray-400">(optional)</span></label>
            <LocationField value={place} onChange={setPlace} inputId="plan-location" label="Where" />
          </div>
          {error && (
            <p role="alert" className="sm:col-span-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
              {plan ? "Update my checklist" : "Get my checklist"}
            </button>
          </div>
        </form>

        {plan && (
          <section aria-labelledby="plan-results" className="mt-10">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <h2 id="plan-results" className="text-xl font-bold text-gray-900 dark:text-white">
                {plan.items.length} {plan.items.length === 1 ? "service" : "services"} for your {typeLabel}
              </h2>
              {plan.totals.suggested_budget != null && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Budget split: {money(plan.totals.suggested_budget)} in total</p>
              )}
            </div>
            <PlanResults plan={plan} />
            <p className="mt-6 text-xs text-gray-400">
              Suggestions are typical for this kind of event, not a quote. Vendor counts are packages on Vendly{plan.date ? " not blocked that day" : ""}
              {plan.near ? ` within about ${plan.radius_miles} miles (or that travel to you)` : ""}.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
