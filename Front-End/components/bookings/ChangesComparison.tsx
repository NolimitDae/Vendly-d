"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { dateText, money, timeText, type Comparison, type RequestTerms } from "@/lib/request-changes";

interface Row {
  label: string;
  before: string;
  after: string;
  /** totals read a little stronger */
  strong?: boolean;
}

const scheduleText = (t: RequestTerms) =>
  t.schedule.map((s) => `${s.label}: ${money(s.amount)}${s.due_at ? ` (${dateText(s.due_at)})` : s.capture_manually ? "" : " when accepted"}`).join("\n");

/** Every line of the before and after, in the order the customer reads a booking. */
export function comparisonRows(c: Comparison): Row[] {
  const { before: b, after: a } = c;
  const rows: Row[] = [
    { label: "Date", before: dateText(b.event_start_at ?? b.scheduled_at), after: dateText(a.event_start_at ?? a.scheduled_at) },
    { label: "Time", before: timeText(b.event_start_at, b.event_end_at), after: timeText(a.event_start_at, a.event_end_at) },
    { label: "Guests", before: b.guest_count != null ? String(b.guest_count) : "Not set", after: a.guest_count != null ? String(a.guest_count) : "Not set" },
    { label: "Package", before: `${money(b.package.amount)}${b.package.unit !== "fixed" ? ` (${b.package.label})` : ""}`, after: `${money(a.package.amount)}${a.package.unit !== "fixed" ? ` (${a.package.label})` : ""}` },
  ];
  for (const p of c.lines) {
    const line = p.after ?? p.before!;
    const word = line.kind === "FEE" ? "Fee" : "Add-on";
    rows.push({
      label: `${word}: ${line.name}`,
      before: p.before ? `${p.before.label} · ${money(p.before.amount)}` : "Not included",
      after: p.after ? `${p.after.label} · ${money(p.after.amount)}` : "Removed",
    });
  }
  const groups = new Map<string, string>();
  for (const g of [...b.options, ...a.options]) groups.set(g.group_id, g.title);
  for (const [id, title] of groups) {
    const was = b.options.find((g) => g.group_id === id);
    const now = a.options.find((g) => g.group_id === id);
    const text = (g?: typeof was) => (g ? `${g.options.map((o) => o.label).join(", ")}${g.amount > 0 ? ` · +${money(g.amount)}` : ""}` : "None");
    rows.push({ label: title, before: text(was), after: text(now) });
  }
  if (b.travel || a.travel) {
    const travel = (t: RequestTerms) => (!t.travel ? "None" : t.travel.fee == null ? "Not worked out" : money(t.travel.fee));
    rows.push({ label: "Travel fee", before: travel(b), after: travel(a) });
  }
  if (b.discount > 0 || a.discount > 0) {
    rows.push({ label: "Promo", before: b.discount > 0 ? `${b.promo_code ?? ""} -${money(b.discount)}`.trim() : "None", after: a.discount > 0 ? `${a.promo_code ?? ""} -${money(a.discount)}`.trim() : "None" });
  }
  rows.push(
    { label: "Vendor price", before: money(b.price), after: money(a.price) },
    { label: "Vendly Protection fee", before: money(b.service_fee), after: money(a.service_fee) },
    { label: "Total", before: money(b.total), after: money(a.total), strong: true },
    { label: "Payments", before: scheduleText(b), after: scheduleText(a) },
  );
  return rows;
}

/**
 * The request before and after the vendor's suggested changes, side by side: date and time, guests, each
 * add-on and fee, the customizations, the total and the payment schedule. Changed rows are highlighted.
 */
export default function ChangesComparison({ comparison, vendorName }: { comparison: Comparison; vendorName?: string }) {
  const rows = comparisonRows(comparison);
  return (
    <div className="space-y-3">
      {comparison.note && (
        <blockquote className="rounded-xl bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Note from {vendorName ?? "the vendor"}</span>
          {comparison.note}
        </blockquote>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
        <table className="w-full text-sm" aria-label="Changes to the request">
          <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400">
            <tr>
              <th scope="col" className="text-left font-medium px-3 py-2">
                <span className="sr-only">Item</span>
              </th>
              <th scope="col" className="text-left font-medium px-3 py-2">Before</th>
              <th scope="col" className="w-5 px-0 py-2">
                <span className="sr-only">to</span>
              </th>
              <th scope="col" className="text-left font-medium px-3 py-2">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changed = r.before !== r.after;
              return (
                <tr key={r.label} data-changed={changed || undefined} className={cn("border-t border-gray-100 dark:border-gray-700 align-top", changed && "bg-amber-50/70 dark:bg-amber-900/15")}>
                  <th scope="row" className={cn("text-left px-3 py-2 font-normal text-gray-500 dark:text-gray-400", r.strong && "font-semibold text-gray-900 dark:text-white")}>
                    {r.label}
                  </th>
                  <td className={cn("px-3 py-2 whitespace-pre-line text-gray-600 dark:text-gray-300", changed && "line-through decoration-gray-400/70", r.strong && "font-semibold")}>{r.before}</td>
                  <td className="px-0 py-2 text-gray-400" aria-hidden>
                    {changed && <ArrowRight className="w-3.5 h-3.5 mt-0.5" />}
                  </td>
                  <td className={cn("px-3 py-2 whitespace-pre-line text-gray-900 dark:text-white", changed && "font-medium", r.strong && "font-semibold")}>{r.after}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {comparison.promo_note && <p className="text-xs text-amber-700 dark:text-amber-300">{comparison.promo_note}</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400">Nothing is charged until the vendor accepts the request.</p>
    </div>
  );
}
