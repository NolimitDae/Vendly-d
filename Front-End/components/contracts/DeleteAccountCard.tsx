"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { CookieHelper } from "@/helper/cookie.helper";
import { Fetch } from "@/lib/Fetch";
import { apiError } from "@/service/contracts/contracts.service";

export default function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await Fetch.delete("/auth/account", {
        headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` },
        data: { confirm: "DELETE" },
      });
      CookieHelper.destroy({ key: "token" });
      toast.success("Your account was deleted.");
      window.location.href = "/";
    } catch (err) {
      toast.error(apiError(err, "Couldn't delete your account"));
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-6 bg-white dark:bg-gray-800 rounded-2xl border border-red-100 dark:border-red-900/40 p-6 space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-white">Delete account</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        This removes your profile and personal data. Signed contracts are kept for 7 years for legal records, along with their
        audit trail, even after your account is deleted.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
          <Trash2 className="w-4 h-4" /> Delete my account
        </button>
      ) : (
        <div className="space-y-2">
          <label htmlFor="confirm-delete" className="block text-sm">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border text-sm">
              Cancel
            </button>
            <button
              onClick={deleteAccount}
              disabled={confirmText !== "DELETE" || busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Permanently delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
