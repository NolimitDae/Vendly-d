import React from "react";

/** Label / value pairs for the admin detail panels; empty values are left out. */
export default function DetailGrid({ items }: { items: [string, React.ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-descriptionColor">{label}</dt>
          <dd className="text-sm text-blackColor break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
