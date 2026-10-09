"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import ContractBody from "@/components/contracts/ContractBody";
import ContractStatusBadge from "@/components/contracts/ContractStatusBadge";
import SignContractPanel from "@/components/contracts/SignContractPanel";
import {
  AmendmentChanges,
  ContractsService,
  SignaturePayload,
  apiError,
  openContractFile,
} from "@/service/contracts/contracts.service";

interface Contract {
  id: string;
  booking_id: string;
  version: number;
  status: string;
  title: string;
  body: string;
  content_sha256: string;
  verification_code: string;
  executed_at: string | null;
  executed_pdf_sha256: string | null;
  is_amendment: boolean;
  amendment_changes: Record<string, unknown> | null;
  has_source_pdf: boolean;
  my_role: string;
  can_sign: boolean;
  awaiting_role: string | null;
  void_reason: string | null;
  consent_text: string;
  listing_title: string | null;
  signatures: { role: string; legal_name: string; signed_at: string }[];
}

const CHANGE_LABELS: Record<string, string> = {
  scheduled_at: "Date",
  event_start_at: "Start",
  event_end_at: "End",
  venue_address: "Venue",
  guest_count: "Guest count",
  amount: "Price",
  cancellation_policy: "Cancellation policy",
};

function formatChange(key: string, value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString();
  if (key === "amount") return `$${Number(value).toFixed(2)}`;
  return String(value);
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signingAmendment, setSigningAmendment] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);

  // amendment request
  const [amendOpen, setAmendOpen] = useState(false);
  const [amend, setAmend] = useState({ date: "", start: "", end: "", venue: "", guests: "", amount: "", cancellation: "" });
  const [amendPreview, setAmendPreview] = useState<null | { body: string; title: string; content_sha256: string; consent_text: string; changes: AmendmentChanges }>(null);

  const load = useCallback(async () => {
    try {
      const res = await ContractsService.get(id);
      setContract(res.data.data);
    } catch (err) {
      toast.error(apiError(err, "Contract not found"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (contract?.my_role !== "VENDOR") return;
    ContractsService.vendorList()
      .then((res) => setHasSavedSignature(!!res.data.data.has_saved_signature))
      .catch(() => null);
  }, [contract?.my_role]);

  const bookingHref = contract
    ? contract.my_role === "VENDOR"
      ? `/vendor/bookings/${contract.booking_id}`
      : `/bookings/${contract.booking_id}`
    : "/bookings";

  const download = (kind: "executed" | "draft" | "source") =>
    openContractFile(() => ContractsService.downloadLink(id, kind)).catch((e) => toast.error(apiError(e, "Download failed")));

  const startSigning = async () => {
    if (contract?.has_source_pdf && !sourceUrl) {
      try {
        const link = await ContractsService.downloadLink(id, "source");
        setSourceUrl(link.data.data.url);
      } catch {
        /* the addendum is still shown */
      }
    }
    setSigningAmendment(true);
  };

  const signAmendment = async (signature: SignaturePayload) => {
    setBusy(true);
    try {
      await ContractsService.sign(id, signature);
      toast.success("Amendment signed. The new version is now in force.");
      setSigningAmendment(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't sign"));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!confirm("Decline this amendment? The current contract stays in force.")) return;
    setBusy(true);
    try {
      await ContractsService.decline(id);
      toast.success("Amendment declined");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't decline"));
    } finally {
      setBusy(false);
    }
  };

  const changesFromForm = (): AmendmentChanges => {
    const iso = (date: string, time: string) => (date && time ? new Date(`${date}T${time}`).toISOString() : undefined);
    const c: AmendmentChanges = {};
    if (amend.date && amend.start) {
      c.event_start_at = iso(amend.date, amend.start);
      c.scheduled_at = c.event_start_at;
    } else if (amend.date) c.scheduled_at = new Date(`${amend.date}T00:00`).toISOString();
    if (amend.date && amend.end) c.event_end_at = iso(amend.date, amend.end);
    if (amend.venue.trim()) c.venue_address = amend.venue.trim();
    if (amend.guests) c.guest_count = Number(amend.guests);
    if (amend.amount) c.amount = Number(amend.amount);
    if (amend.cancellation) c.cancellation_policy = amend.cancellation;
    return c;
  };

  const previewAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    const changes = changesFromForm();
    if (!Object.keys(changes).length) return toast.error("Enter at least one change");
    setBusy(true);
    try {
      const res = await ContractsService.amendmentPreview(contract.booking_id, changes);
      const d = res.data.data;
      if (d.missing_message) return toast.error(d.missing_message);
      setAmendPreview({ body: d.body, title: d.title, content_sha256: d.content_sha256, consent_text: d.consent_text, changes });
    } catch (err) {
      toast.error(apiError(err, "Couldn't prepare the amendment"));
    } finally {
      setBusy(false);
    }
  };

  const sendAmendment = async (signature: SignaturePayload) => {
    if (!contract || !amendPreview) return;
    setBusy(true);
    try {
      const res = await ContractsService.requestAmendment(contract.booking_id, amendPreview.changes, signature);
      toast.success("Amendment sent for signature");
      window.location.href = `/contracts/${res.data.data.id}`;
    } catch (err) {
      toast.error(apiError(err, "Couldn't send the amendment"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!contract) return <p className="p-8 text-center text-gray-500">Contract not found.</p>;

  const isParty = ["VENDOR", "CUSTOMER", "PLANNER"].includes(contract.my_role);
  const canAmend = isParty && contract.status === "EXECUTED";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link href={bookingHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to booking
      </Link>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">{contract.title}</h1>
            <p className="text-sm text-gray-500">
              {contract.listing_title ? `${contract.listing_title} · ` : ""}Version {contract.version}
              {contract.is_amendment ? " (amendment)" : ""}
            </p>
          </div>
          <ContractStatusBadge status={contract.status} />
        </div>

        {contract.amendment_changes && (
          <div className="text-sm">
            <p className="font-medium mb-1">Changes in this amendment</p>
            <ul className="list-disc pl-5 text-gray-600 dark:text-gray-300">
              {Object.entries(contract.amendment_changes).map(([k, v]) => (
                <li key={k}>
                  {CHANGE_LABELS[k] ?? k}: {formatChange(k, v)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {contract.void_reason && <p className="text-sm text-gray-500">Void: {contract.void_reason}</p>}

        <div className="text-xs text-gray-500 space-y-0.5">
          {contract.signatures.map((s) => (
            <p key={s.role}>
              Signed by {s.legal_name} ({s.role.toLowerCase()}) on {new Date(s.signed_at).toLocaleString()}
            </p>
          ))}
          {contract.awaiting_role && <p>Waiting for the {contract.awaiting_role.toLowerCase()} to sign.</p>}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {contract.status === "EXECUTED" && (
            <button onClick={() => download("executed")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm">
              <Download className="w-4 h-4" /> Signed PDF
            </button>
          )}
          <button onClick={() => download("draft")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm">
            <Download className="w-4 h-4" /> {contract.status === "EXECUTED" ? "Text only" : "Draft PDF"}
          </button>
          {contract.has_source_pdf && (
            <button onClick={() => download("source")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm">
              <FileText className="w-4 h-4" /> Vendor&apos;s PDF
            </button>
          )}
        </div>

        {contract.status === "EXECUTED" && (
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            Verification code {contract.verification_code}.{" "}
            <Link href={`/contracts/verify?code=${contract.verification_code}`} className="underline">
              Verify a copy
            </Link>
          </p>
        )}
      </div>

      {contract.can_sign && contract.is_amendment && !signingAmendment && (
        <div className="flex gap-2">
          <button onClick={startSigning} className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-semibold">
            Review &amp; sign amendment
          </button>
          <button onClick={decline} disabled={busy} className="px-4 py-3 rounded-xl border border-red-200 text-red-600">
            Decline
          </button>
        </div>
      )}
      {contract.is_amendment && contract.awaiting_role && !contract.can_sign && isParty && (
        <button onClick={decline} disabled={busy} className="text-sm text-red-600 underline">
          Withdraw this amendment
        </button>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        {signingAmendment ? (
          <SignContractPanel
            title={contract.title}
            body={contract.body}
            contentSha256={contract.content_sha256}
            consentText={contract.consent_text}
            sourcePdfUrl={sourceUrl}
            vendor={contract.my_role === "VENDOR" ? { hasSavedSignature } : undefined}
            submitLabel="Sign amendment"
            busy={busy}
            onSubmit={signAmendment}
            onCancel={() => setSigningAmendment(false)}
          />
        ) : (
          <ContractBody body={contract.body} />
        )}
      </div>

      {canAmend && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
          {!amendOpen ? (
            <button onClick={() => setAmendOpen(true)} className="text-sm text-primary font-medium">
              Request a change (date, time, venue{contract.my_role === "VENDOR" ? ", price, cancellation terms" : ", guests"})
            </button>
          ) : amendPreview ? (
            <SignContractPanel
              title={amendPreview.title}
              body={amendPreview.body}
              contentSha256={amendPreview.content_sha256}
              consentText={amendPreview.consent_text}
              vendor={contract.my_role === "VENDOR" ? { hasSavedSignature } : undefined}
              submitLabel="Sign & send amendment"
              busy={busy}
              onSubmit={sendAmendment}
              onCancel={() => setAmendPreview(null)}
            />
          ) : (
            <form onSubmit={previewAmendment} className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Changes need a new contract version signed by both sides. The current contract stays in force until then.
                Editing booking comments doesn&apos;t need re-signing.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input type="date" aria-label="New date" value={amend.date} onChange={(e) => setAmend({ ...amend, date: e.target.value })} className={inputCls} />
                <input type="time" aria-label="New start time" value={amend.start} onChange={(e) => setAmend({ ...amend, start: e.target.value })} className={inputCls} />
                <input type="time" aria-label="New end time" value={amend.end} onChange={(e) => setAmend({ ...amend, end: e.target.value })} className={inputCls} />
              </div>
              <input placeholder="New venue address" value={amend.venue} onChange={(e) => setAmend({ ...amend, venue: e.target.value })} className={inputCls} />
              <input type="number" min={1} placeholder="New guest count" value={amend.guests} onChange={(e) => setAmend({ ...amend, guests: e.target.value })} className={inputCls} />
              {contract.my_role === "VENDOR" && (
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={0} step="0.01" placeholder="New price" value={amend.amount} onChange={(e) => setAmend({ ...amend, amount: e.target.value })} className={inputCls} />
                  <select value={amend.cancellation} onChange={(e) => setAmend({ ...amend, cancellation: e.target.value })} className={inputCls} aria-label="Cancellation policy">
                    <option value="">Cancellation policy unchanged</option>
                    <option value="flexible">Flexible</option>
                    <option value="moderate">Moderate</option>
                    <option value="strict">Strict</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setAmendOpen(false)} className="px-4 py-2 rounded-lg border text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-60">
                  {busy ? "Preparing…" : "Review amendment"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
