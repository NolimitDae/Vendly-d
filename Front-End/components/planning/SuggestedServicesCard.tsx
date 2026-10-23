"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Lightbulb, Loader2, Plus, Store } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { availabilityLabel, groupByPriority, money, PRIORITY_LABEL } from "@/lib/plan";
import { EventsService } from "@/service/events/events.service";
import { PlanningService, type Plan, type PlanItem } from "@/service/planning/planning.service";
import { errorMessage } from "@/service/rentals/rentals.service";
import { BookBy, FindVendorsLink } from "./PlanResults";

const COVERED_LABEL: Record<NonNullable<PlanItem["covered_by"]>, string> = {
  booking: "Booked",
  budget: "In budget",
  venue: "Venue set",
};

export interface AddedBudgetLine {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  note?: string;
}

/**
 * Planner event page: the services this kind of event usually needs, what is already booked or
 * budgeted (✓) and what is still to do, with "Find vendors" (bookings link to this event) and
 * "Add to budget" (a budget line at the suggested amount).
 */
export default function SuggestedServicesCard({
  eventId,
  readOnly = false,
  refreshKey,
  onBudgetAdded,
}: {
  eventId: string;
  readOnly?: boolean;
  /** reloads when this changes (e.g. after the event is edited) */
  refreshKey?: unknown;
  onBudgetAdded?: (line: AddedBudgetLine) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    PlanningService.eventPlan(eventId)
      .then((r) => live && (r.data?.success ? setPlan(r.data.data) : setFailed(true)))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [eventId, refreshKey]);

  const addToBudget = async (item: PlanItem) => {
    if (item.suggested_budget == null) return;
    setAdding(item.category.id);
    try {
      const res = await EventsService.addBudgetItem(eventId, {
        category: item.category.name,
        allocated: item.suggested_budget,
        note: "Suggested split",
      });
      if (!res.data?.success) throw new Error(res.data?.message);
      setPlan((p) =>
        p
          ? {
              ...p,
              items: p.items.map((i) => (i.category.id === item.category.id ? { ...i, covered: true, covered_by: "budget" } : i)),
              summary: p.summary ? { ...p.summary, covered: p.summary.covered + 1 } : p.summary,
            }
          : p,
      );
      const line = res.data.data;
      onBudgetAdded?.({ ...line, allocated: Number(line.allocated), spent: Number(line.spent ?? 0) });
      toast.success(`${item.category.name} added to the budget`);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't add it to the budget"));
    } finally {
      setAdding(null);
    }
  };

  return (
    <section aria-labelledby="suggested-services" className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="suggested-services" className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Suggested services
        </h2>
        {plan?.summary && plan.summary.total > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {plan.summary.covered} of {plan.summary.total} covered
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="Loading suggestions" />
        </div>
      ) : failed || !plan ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Suggestions aren&apos;t available right now.</p>
      ) : plan.items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No suggestions for this event yet.</p>
      ) : (
        <div className="space-y-5">
          {(!plan.event?.type_set || plan.budget == null) && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {!plan.event?.type_set && "Set the event type for a list made for it. "}
              {plan.budget == null && "Add a total budget to see a suggested split."}
            </p>
          )}
          {groupByPriority(plan.items).map((group) => (
            <div key={group.priority}>
              <h3 className="mb-2 text-xs font-semibold text-gray-400">{PRIORITY_LABEL[group.priority]}</h3>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {group.items.map((item) => (
                  <li key={item.category.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      {item.covered ? (
                        <CheckCircle2 className="mt-0.5 w-5 h-5 flex-shrink-0 text-green-600" aria-hidden="true" />
                      ) : (
                        <Circle className="mt-0.5 w-5 h-5 flex-shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                      )}
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item.category.name}
                          <span
                            className={cn(
                              "ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              item.covered
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
                            )}
                          >
                            {item.covered && item.covered_by ? `✓ ${COVERED_LABEL[item.covered_by]}` : "To do"}
                          </span>
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{item.why}</p>
                        {item.tip && (
                          <p className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" aria-hidden="true" />
                            {item.tip}
                          </p>
                        )}
                        {!item.covered && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <BookBy item={item} />
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Store className="w-3.5 h-3.5" aria-hidden="true" />
                              {availabilityLabel(item)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2 pl-8 sm:pl-0">
                      {item.suggested_budget != null && (
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{money(item.suggested_budget)}</span>
                      )}
                      {!readOnly && !item.covered && (
                        <>
                          {item.suggested_budget != null && (
                            <button
                              type="button"
                              onClick={() => addToBudget(item)}
                              disabled={adding === item.category.id}
                              aria-label={`Add to budget: ${item.category.name}, ${money(item.suggested_budget)}`}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                            >
                              {adding === item.category.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                              Add to budget
                            </button>
                          )}
                          <FindVendorsLink item={item} eventId={eventId} />
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
