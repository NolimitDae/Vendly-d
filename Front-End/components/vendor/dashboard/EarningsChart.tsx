"use client";

export interface MonthEarned {
  month: string;
  label: string;
  earned: number;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Earned by month as plain bars (the tallest month fills the height), like the app's dashboard. A
 * hidden table carries the numbers for screen readers.
 */
export default function EarningsChart({ months }: { months: MonthEarned[] }) {
  const best = Math.max(0, ...months.map((m) => m.earned));
  const bestMonth = months.find((m) => m.earned === best && best > 0);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 h-40" aria-hidden>
        {months.map((m) => (
          <div key={m.month} className="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0">
            <div className="flex-1 w-full flex items-end">
              {m.earned > 0 && (
                <div
                  title={`${m.label}: ${money(m.earned)}`}
                  className="w-full rounded-t-md bg-gradient-to-t from-plum-700 to-orchid-500"
                  style={{ height: `${Math.max(4, (m.earned / best) * 100)}%` }}
                />
              )}
            </div>
            {/* one letter on phones so twelve months fit */}
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="sm:hidden">{m.label.slice(0, 1)}</span>
              <span className="hidden sm:inline">{m.label.slice(0, 3)}</span>
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Earned by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Earned</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{m.label}</td>
              <td>{money(m.earned)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {bestMonth ? `Best month: ${bestMonth.label} at ${money(best)}` : `Nothing paid out yet in the last ${months.length} months.`}
      </p>
    </div>
  );
}
