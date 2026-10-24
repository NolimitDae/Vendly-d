"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ModalWrapper from "./modal/ModalWrapper";

interface Props {
  /** who is being suspended or reactivated */
  name: string;
  /** true to suspend, false to reactivate */
  suspend: boolean;
  onCancel: () => void;
  /** resolves when saved; the dialog stays open (and shows the button again) if it throws */
  onConfirm: (reason: string) => Promise<void>;
}

const MIN_REASON = 5;

/**
 * Confirm step for suspending or reactivating an account (PATCH /admin/users/:id/status).
 * A reason is needed to suspend; the person sees it in their inbox once they're back.
 */
export default function AccountStatusDialog({ name, suspend, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const tooShort = suspend && reason.trim().length < MIN_REASON;

  const confirm = async () => {
    if (tooShort || busy) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } catch {
      // the caller shows the error; keep the dialog so they can try again
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalWrapper isOpen onClose={busy ? () => {} : onCancel} size="md">
      <div role="dialog" aria-modal="true" aria-labelledby="account-status-title" className="p-6 space-y-4">
        <h2 id="account-status-title" className="text-lg font-semibold text-blackColor pr-10">
          {suspend ? `Suspend ${name}?` : `Reactivate ${name}?`}
        </h2>
        <p className="text-sm text-descriptionColor leading-[160%]">
          {suspend
            ? "They're signed out everywhere straight away and can't sign in until you reactivate the account."
            : "They can sign in and use Vendly again straight away."}
        </p>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-blackColor">
            {suspend ? "Reason" : "Note (optional)"}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={suspend ? "For example: several customers reported no-shows" : "For example: documents checked again"}
            className="w-full px-3 py-2 rounded-xl border border-borderColor bg-white dark:bg-gray-800 text-sm text-blackColor focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="block text-xs text-descriptionColor">They&apos;ll see this in their notifications.</span>
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-full border border-borderColor text-sm font-semibold text-blackColor disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={tooShort || busy}
            className={`px-4 py-2 rounded-full text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60 ${suspend ? "bg-red-500" : "bg-primary"}`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {suspend ? "Suspend account" : "Reactivate account"}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
