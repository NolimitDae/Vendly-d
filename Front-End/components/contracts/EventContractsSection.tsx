"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileSignature, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { ContractsService, apiError, openContractFile } from "@/service/contracts/contracts.service";
import ContractStatusBadge from "./ContractStatusBadge";

interface Row {
  booking_id: string;
  booking_status: string;
  listing_title: string | null;
  vendor_name: string;
  pending_amendment: boolean;
  contract: { id: string; status: string; version: number; executed_at: string | null } | null;
}

/** Every vendor contract for an event, with a download-all zip of the executed PDFs. */
export default function EventContractsSection({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [executed, setExecuted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    ContractsService.eventContracts(eventId)
      .then((res) => {
        setRows(res.data.data);
        setExecuted(res.data.executed_count);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [eventId]);

  const downloadAll = async () => {
    setZipping(true);
    try {
      await openContractFile(() => ContractsService.eventZip(eventId));
    } catch (err) {
      toast.error(apiError(err, "Couldn't prepare the download"));
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <FileSignature className="w-4 h-4 text-primary" /> Vendor contracts
        </h3>
        <button
          onClick={downloadAll}
          disabled={!executed || zipping}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50"
        >
          {zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download all ({executed})
        </button>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No vendor bookings on this event yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map((r) => (
            <li key={r.booking_id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{r.vendor_name}</p>
                <p className="text-xs text-gray-500">
                  {r.listing_title}
                  {r.pending_amendment ? " · amendment waiting for signature" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.contract ? (
                  <>
                    <ContractStatusBadge status={r.contract.status} />
                    <Link href={`/contracts/${r.contract.id}`} className="text-primary underline text-xs">
                      View
                    </Link>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">No contract</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
