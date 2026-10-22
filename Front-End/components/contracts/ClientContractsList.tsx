"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature, Loader2 } from "lucide-react";
import { ContractsService } from "@/service/contracts/contracts.service";
import ContractStatusBadge from "@/components/contracts/ContractStatusBadge";

interface ClientContract {
  id: string;
  status: string;
  title: string;
  version: number;
  can_sign: boolean;
  listing_title: string | null;
  vendor_name: string | null;
}

/** The planner's client sees each vendor contract on their event and co-signs the ones waiting for them. */
export default function ClientContractsList({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ClientContract[] | null>(null);

  useEffect(() => {
    ContractsService.clientEventContracts(eventId)
      .then((r) => setRows(r.data?.data ?? []))
      .catch(() => setRows([]));
  }, [eventId]);

  if (rows === null) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;

  return (
    <ul className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
      {rows.length === 0 && <li className="p-6 text-sm text-gray-500 text-center">No vendor contracts yet.</li>}
      {rows.map((c) => (
        <li key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
          <FileSignature className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-medium text-gray-900 dark:text-white">{c.listing_title ?? c.title}</span>
            <span className="block text-sm text-gray-500 dark:text-gray-400">
              {c.vendor_name ?? "Vendor"} · version {c.version}
            </span>
          </span>
          <ContractStatusBadge status={c.status} />
          <Link
            href={`/contracts/${c.id}`}
            className={
              c.can_sign
                ? "px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
                : "px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-center"
            }
          >
            {c.can_sign ? "Review & co-sign" : "View"}
          </Link>
        </li>
      ))}
    </ul>
  );
}
