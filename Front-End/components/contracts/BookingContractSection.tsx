"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileSignature, Loader2, PenLine, X } from "lucide-react";
import { toast } from "react-toastify";
import { BookingService } from "@/service/booking/booking.service";
import {
  ContractsService,
  SignaturePayload,
  apiError,
  openContractFile,
} from "@/service/contracts/contracts.service";
import ContractStatusBadge from "./ContractStatusBadge";
import SignContractPanel from "./SignContractPanel";

interface ContractSummary {
  id: string;
  version: number;
  status: string;
  title: string;
  is_amendment: boolean;
  awaiting_role: string | null;
  can_sign: boolean;
  executed_at: string | null;
  verification_code: string;
  signatures: { role: string; legal_name: string; signed_at: string }[];
}

interface Props {
  bookingId: string;
  role: "VENDOR" | "CUSTOMER";
  bookingStatus: string;
  defaultName?: string;
  onChanged?: () => void;
}

export default function BookingContractSection({ bookingId, role, bookingStatus, defaultName, onChanged }: Props) {
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<null | {
    body: string;
    title: string;
    content_sha256: string;
    consent_text: string;
    source_pdf_url: string | null;
  }>(null);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ContractsService.forBooking(bookingId);
      setContracts(res.data.data.contracts);
      setCurrentId(res.data.data.current_id);
    } catch {
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const current = contracts.find((c) => c.id === currentId) ?? null;
  const pendingAmendment = contracts.find((c) => c.is_amendment && c.awaiting_role);
  const needsVendorSignature =
    role === "VENDOR" && bookingStatus === "PENDING" && current?.status === "AWAITING_VENDOR" && !current.is_amendment;

  const openAcceptAndSign = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const [c, mine] = await Promise.all([ContractsService.get(current.id), ContractsService.vendorList()]);
      const d = c.data.data;
      let sourceUrl: string | null = null;
      if (d.has_source_pdf) {
        const link = await ContractsService.downloadLink(current.id, "source");
        sourceUrl = link.data.data.url;
      }
      setHasSavedSignature(!!mine.data.data.has_saved_signature);
      setSigning({ body: d.body, title: d.title, content_sha256: d.content_sha256, consent_text: d.consent_text, source_pdf_url: sourceUrl });
    } catch (err) {
      toast.error(apiError(err, "Couldn't open the contract"));
    } finally {
      setBusy(false);
    }
  };

  const acceptAndSign = async (signature: SignaturePayload) => {
    setBusy(true);
    try {
      await BookingService.confirm(bookingId, signature);
      toast.success("Contract signed and booking confirmed");
      setSigning(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(apiError(err, "Couldn't sign the contract"));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    const reason = window.prompt("Reason for declining (shared with the customer):") ?? undefined;
    if (reason === undefined) return;
    setBusy(true);
    try {
      await BookingService.reject(bookingId, reason || undefined);
      toast.success("Booking declined. The contract is void.");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(apiError(err, "Couldn't decline the booking"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Contract</h2>
        </div>
        {current && <ContractStatusBadge status={current.status} />}
      </div>

      {!current ? (
        <p className="text-sm text-gray-500">This booking was made before contracts and has no contract.</p>
      ) : (
        <>
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            <p>
              {current.title} · version {current.version}
            </p>
            {current.signatures.map((s) => (
              <p key={s.role} className="text-xs text-gray-500">
                Signed by {s.legal_name} ({s.role.toLowerCase()}) on {new Date(s.signed_at).toLocaleString()}
              </p>
            ))}
            {current.status === "EXECUTED" && (
              <p className="text-xs text-gray-500">Verification code: {current.verification_code}</p>
            )}
          </div>

          {needsVendorSignature && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300">
              The customer signed this contract. Review it and Accept &amp; Sign to confirm the booking.
            </div>
          )}
          {pendingAmendment && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300">
              Amendment (version {pendingAmendment.version}){" "}
              {pendingAmendment.can_sign ? "is waiting for your signature." : "is waiting for the other party."}{" "}
              <Link href={`/contracts/${pendingAmendment.id}`} className="underline font-medium">
                Review
              </Link>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {needsVendorSignature && (
              <button
                onClick={openAcceptAndSign}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                Accept &amp; Sign
              </button>
            )}
            {needsVendorSignature && (
              <button
                onClick={decline}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 disabled:opacity-60"
              >
                Decline
              </button>
            )}
            <Link
              href={`/contracts/${current.id}`}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              View contract
            </Link>
            {current.status === "EXECUTED" && (
              <button
                onClick={() =>
                  openContractFile(() => ContractsService.downloadLink(current.id, "executed")).catch((e) =>
                    toast.error(apiError(e, "Download failed")),
                  )
                }
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Download className="w-4 h-4" /> Signed PDF
              </button>
            )}
          </div>
          {contracts.length > 1 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">All versions ({contracts.length})</summary>
              <ul className="mt-2 space-y-1">
                {contracts.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <Link href={`/contracts/${c.id}`} className="underline">
                      Version {c.version}
                    </Link>
                    <ContractStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {signing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !busy && setSigning(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Accept &amp; Sign</h3>
              <button onClick={() => setSigning(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SignContractPanel
              title={signing.title}
              body={signing.body}
              contentSha256={signing.content_sha256}
              consentText={signing.consent_text}
              sourcePdfUrl={signing.source_pdf_url}
              defaultName={defaultName}
              vendor={{ hasSavedSignature }}
              submitLabel="Accept & Sign"
              busy={busy}
              onSubmit={acceptAndSign}
              onCancel={() => setSigning(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
