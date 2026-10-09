const STYLES: Record<string, string> = {
  AWAITING_VENDOR: "bg-amber-100 text-amber-800",
  AWAITING_CUSTOMER: "bg-amber-100 text-amber-800",
  EXECUTED: "bg-green-100 text-green-800",
  VOID: "bg-gray-100 text-gray-600",
  SUPERSEDED: "bg-gray-100 text-gray-600",
  DRAFT: "bg-blue-100 text-blue-800",
};

const LABELS: Record<string, string> = {
  AWAITING_VENDOR: "Awaiting vendor signature",
  AWAITING_CUSTOMER: "Awaiting customer signature",
  EXECUTED: "Signed",
  VOID: "Void",
  SUPERSEDED: "Superseded",
  DRAFT: "Draft",
};

export default function ContractStatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
