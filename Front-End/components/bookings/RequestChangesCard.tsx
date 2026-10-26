"use client";

import { useCallback, useEffect, useState } from "react";
import { FilePenLine, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { BookingService } from "@/service/booking/booking.service";
import { ContractsService, apiError, type SignaturePayload } from "@/service/contracts/contracts.service";
import type { ChangesState } from "@/lib/request-changes";
import SignContractPanel from "@/components/contracts/SignContractPanel";
import ChangesComparison from "./ChangesComparison";
import SuggestChangesDialog from "./SuggestChangesDialog";

interface Props {
  bookingId: string;
  role: "VENDOR" | "CUSTOMER";
  bookingStatus: string;
  /** the other side's name, for the messages */
  otherName: string;
  defaultName?: string;
  onChanged?: () => void;
}

const box = "bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4";
const notice = "p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300";

/**
 * Suggested changes on a booking request. The vendor can suggest changes (and withdraw them while they
 * wait); the customer sees what changed, before and after, and approves and signs, or declines.
 */
export default function RequestChangesCard({ bookingId, role, bookingStatus, otherName, defaultName, onChanged }: Props) {
  const [state, setState] = useState<ChangesState | null>(null);
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState<null | { title: string; body: string; content_sha256: string; consent_text: string; source_pdf_url: string | null }>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await BookingService.changes(bookingId);
      setState(res.data.data);
    } catch {
      setState(null);
    }
  }, [bookingId]);

  useEffect(() => {
    if (bookingStatus === "PENDING") load();
  }, [load, bookingStatus]);

  if (bookingStatus !== "PENDING" || !state) return null;
  const p = state.proposal;
  const done = async () => {
    await load();
    onChanged?.();
  };

  const openApprove = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const c = (await ContractsService.get(p.contract_id)).data.data;
      // a vendor's own uploaded contract still applies: the updated terms are its addendum
      const source = c.has_source_pdf ? (await ContractsService.downloadLink(p.contract_id, "source")).data.data.url : null;
      setSigning({ title: c.title, body: c.body, content_sha256: c.content_sha256, consent_text: c.consent_text, source_pdf_url: source });
    } catch (err) {
      toast.error(apiError(err, "Couldn't open the contract"));
    } finally {
      setBusy(false);
    }
  };

  const approve = async (signature: SignaturePayload) => {
    setBusy(true);
    try {
      await BookingService.approveChanges(bookingId, signature);
      toast.success(`Changes approved. ${otherName} can now accept your request.`);
      setSigning(null);
      await done();
    } catch (err) {
      toast.error(apiError(err, "Couldn't approve the changes"));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    const reason = window.prompt("Decline the changes? Your original request stays as it was. A reason for the vendor (optional):");
    if (reason === null) return;
    setBusy(true);
    try {
      await BookingService.declineChanges(bookingId, reason.trim() || undefined);
      toast.success("Changes declined. Your original request stands.");
      await done();
    } catch (err) {
      toast.error(apiError(err, "Couldn't decline the changes"));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!window.confirm(`Withdraw your suggested changes? ${otherName}'s original request stands and you can accept it.`)) return;
    setBusy(true);
    try {
      await BookingService.withdrawChanges(bookingId);
      toast.success("Changes withdrawn");
      await done();
    } catch (err) {
      toast.error(apiError(err, "Couldn't withdraw the changes"));
    } finally {
      setBusy(false);
    }
  };

  // ─── Customer ──────────────────────────────────────────────────────────────
  if (role === "CUSTOMER") {
    if (!p) return null;
    return (
      <section className={box} aria-labelledby="suggested-changes">
        <div className="flex items-center gap-2">
          <FilePenLine className="w-5 h-5 text-primary" />
          <h2 id="suggested-changes" className="font-semibold text-gray-900 dark:text-white">
            {p.status === "WAITING" ? `${p.vendor_name} suggested changes` : "Suggested changes"}
          </h2>
        </div>
        {p.status === "WAITING" ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Here is what {p.vendor_name} would change before accepting. Approve and sign the updated contract, or decline to keep your original request. Your request stays open while you decide.
            </p>
            <ChangesComparison comparison={p} vendorName={p.vendor_name} />
            {signing ? (
              <SignContractPanel
                title={signing.title}
                body={signing.body}
                contentSha256={signing.content_sha256}
                consentText={signing.consent_text}
                sourcePdfUrl={signing.source_pdf_url}
                defaultName={defaultName}
                submitLabel="Approve and sign"
                busy={busy}
                onSubmit={approve}
                onCancel={() => setSigning(null)}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openApprove}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Approve and sign
                </button>
                <button
                  type="button"
                  onClick={decline}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 disabled:opacity-60"
                >
                  Decline changes
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {p.status === "APPROVED"
              ? p.client_cosigning
                ? `You approved the changes. Your client co-signs them next, then ${p.vendor_name} can accept your request.`
                : `You approved the changes. ${p.vendor_name} can now accept your request.`
              : p.status === "DECLINED"
                ? "You declined the suggested changes. Your original request stands."
                : `${p.vendor_name} withdrew the changes they suggested. Your original request stands.`}
          </p>
        )}
      </section>
    );
  }

  // ─── Vendor ────────────────────────────────────────────────────────────────
  if (!p && !state.can_suggest) return null;
  return (
    <section className={box} aria-labelledby="suggest-changes">
      <div className="flex items-center gap-2">
        <FilePenLine className="w-5 h-5 text-primary" />
        <h2 id="suggest-changes" className="font-semibold text-gray-900 dark:text-white">
          Changes to the request
        </h2>
      </div>
      {p?.status === "WAITING" && (
        <>
          <div className={notice}>
            Your suggested changes are waiting for {otherName}. The request stays open while they decide, and you can accept once they answer.
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-700 dark:text-gray-300">What you suggested</summary>
            <div className="mt-3">
              <ChangesComparison comparison={p} vendorName="you" />
            </div>
          </details>
          <button type="button" onClick={withdraw} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-60">
            Withdraw changes
          </button>
        </>
      )}
      {p?.status === "APPROVED" && (
        <div className={notice}>
          {p.client_cosigning
            ? `${otherName} approved your changes. Their client co-signs them next; you can Accept & Sign once they have.`
            : "Customer approved your changes. Review the updated contract below and Accept & Sign to confirm the booking."}
        </div>
      )}
      {p?.status === "DECLINED" && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {otherName} declined your suggested changes. Their original request stands: you can accept it, suggest other changes, or decline it.
        </p>
      )}
      {p?.status === "WITHDRAWN" && <p className="text-sm text-gray-600 dark:text-gray-300">You withdrew your suggested changes. The original request stands.</p>}
      {state.can_suggest && (
        <>
          {!p && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Need a different date, guest count, add-ons or prices before you accept? Suggest changes and {otherName} can approve them.
            </p>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-lg border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/5"
          >
            Suggest changes
          </button>
        </>
      )}
      {editing && state.editor && (
        <SuggestChangesDialog
          bookingId={bookingId}
          editor={state.editor}
          customerName={otherName}
          onClose={() => setEditing(false)}
          onSent={async () => {
            setEditing(false);
            await done();
          }}
        />
      )}
    </section>
  );
}
