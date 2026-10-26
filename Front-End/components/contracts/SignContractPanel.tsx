"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, PenLine } from "lucide-react";
import ContractBody from "./ContractBody";
import SignaturePad from "./SignaturePad";
import type { SignaturePayload } from "@/service/contracts/contracts.service";

interface Props {
  title?: string;
  body: string;
  contentSha256: string;
  consentText: string;
  sourcePdfUrl?: string | null;
  defaultName?: string;
  submitLabel: string;
  /** Vendor-only options: reuse or save a drawn signature. */
  vendor?: { hasSavedSignature?: boolean };
  busy?: boolean;
  onSubmit: (signature: SignaturePayload) => void;
  onCancel?: () => void;
}

export default function SignContractPanel({
  title,
  body,
  contentSha256,
  consentText,
  sourcePdfUrl,
  defaultName = "",
  submitLabel,
  vendor,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(false);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState(defaultName);
  const [image, setImage] = useState<string | null>(null);
  const [useSaved, setUseSaved] = useState(!!vendor?.hasSavedSignature);
  const [saveForLater, setSaveForLater] = useState(true);

  // short contracts that fit without scrolling count as read
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  }, [body]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
  };

  // a drawn, confirmed signature is required; a vendor may use their saved one instead
  const usingSaved = !!(vendor?.hasSavedSignature && useSaved);
  const signed = usingSaved || !!image;
  const canSign = readToEnd && consent && name.trim().length >= 2 && signed && !busy;

  const submit = () => {
    if (!canSign) return;
    onSubmit({
      legal_name: name.trim(),
      consent: true,
      content_sha256: contentSha256,
      device_platform: "web",
      ...(usingSaved ? { use_saved_signature: true } : { signature_image: image! }),
      ...(vendor && !usingSaved && saveForLater ? { save_signature: true } : {}),
    });
  };

  return (
    <div className="space-y-4">
      {sourcePdfUrl && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <FileText className="w-4 h-4" /> Vendor&apos;s contract
            </span>
            <a href={sourcePdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Open full screen
            </a>
          </div>
          <iframe src={sourcePdfUrl} title="Vendor contract" className="w-full h-72 bg-white dark:bg-gray-800" />
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[50vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900"
        data-testid="contract-scroll"
      >
        {title && sourcePdfUrl && <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Booking addendum</p>}
        <ContractBody body={body} />
      </div>
      {!readToEnd && <p className="text-xs text-amber-600">Scroll to the end of the contract to sign.</p>}

      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>{consentText}</span>
      </label>

      <div>
        <label htmlFor="legal-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Full legal name
        </label>
        <input
          id="legal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {vendor?.hasSavedSignature && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useSaved}
            onChange={(e) => {
              setUseSaved(e.target.checked);
              // the pad starts empty again, so nothing unseen is sent
              setImage(null);
            }}
            className="h-4 w-4 accent-primary"
          />
          Use my saved signature
        </label>
      )}
      {!usingSaved && (
        <>
          <div>
            <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Signature</p>
            <SignaturePad onChange={setImage} />
          </div>
          {vendor && !vendor.hasSavedSignature && image && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saveForLater} onChange={(e) => setSaveForLater(e.target.checked)} className="h-4 w-4 accent-primary" />
              Save this signature for future bookings
            </label>
          )}
        </>
      )}

      {!signed && <p className="text-xs text-amber-600">Draw your signature and tap Confirm signature to sign.</p>}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canSign}
          className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
