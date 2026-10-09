"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { ContractsService, apiError } from "@/service/contracts/contracts.service";

interface CodeResult {
  booking_id: string;
  version: number;
  status: string;
  executed_at: string | null;
  executed_pdf_sha256: string | null;
}

function VerifyContent() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null);
  const [fileResult, setFileResult] = useState<null | { valid: boolean; sha256: string; executed_at?: string; booking_id?: string; version?: number }>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (value = code) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ContractsService.verifyCode(value.trim());
      setCodeResult(res.data.data);
    } catch (err) {
      setCodeResult(null);
      setError(apiError(err, "No contract matches this code."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.get("code")) lookup(params.get("code")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ContractsService.verifyFile(file);
      setFileResult(res.data.data);
    } catch (err) {
      setError(apiError(err, "Couldn't check this file."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verify a signed contract</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every executed Vendly contract has a verification code and a recorded SHA-256 fingerprint. Upload a copy to
          confirm it hasn&apos;t been changed.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
        <label htmlFor="pdf" className="font-medium text-sm">Check a PDF</label>
        <label className="flex items-center justify-center gap-2 px-4 py-6 rounded-xl border border-dashed border-gray-300 cursor-pointer text-sm text-gray-500 hover:border-primary">
          <Upload className="w-4 h-4" /> Choose the contract PDF
          <input id="pdf" type="file" accept="application/pdf" className="hidden" onChange={(e) => checkFile(e.target.files?.[0])} />
        </label>
        {fileResult &&
          (fileResult.valid ? (
            <p className="flex items-start gap-2 text-sm text-green-700">
              <ShieldCheck className="w-5 h-5 flex-shrink-0" />
              Genuine. This is the unmodified executed contract (version {fileResult.version}) for booking {fileResult.booking_id},
              signed {fileResult.executed_at ? new Date(fileResult.executed_at).toLocaleString() : ""}.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-red-600">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              Not verified. This file doesn&apos;t match any executed Vendly contract. It may have been modified.
            </p>
          ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
        className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3"
      >
        <label htmlFor="code" className="font-medium text-sm">Look up a verification code</label>
        <div className="flex gap-2">
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-mono"
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
          </button>
        </div>
        {codeResult && (
          <div className="text-sm space-y-1">
            <p className="flex items-center gap-1.5 text-green-700">
              <CheckCircle2 className="w-4 h-4" /> Contract found: booking {codeResult.booking_id}, version {codeResult.version}, status{" "}
              {codeResult.status.toLowerCase()}.
            </p>
            {codeResult.executed_pdf_sha256 && (
              <p className="text-xs text-gray-500 break-all">SHA-256 of the signed PDF: {codeResult.executed_pdf_sha256}</p>
            )}
          </div>
        )}
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function VerifyContractPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}
