"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { ArrowLeft, BadgeCheck, Camera, Clock, IdCard, Loader2, Lock } from "lucide-react";
import Container from "@/app/_components/Container";
import { IdentityService, IdStatus } from "@/service/identity/identity.service";

const DOCS = [
  { value: "DRIVERS_LICENSE", label: "Driver's licence" },
  { value: "STATE_ID", label: "State ID card" },
  { value: "NATIONAL_ID", label: "National ID card" },
  { value: "PASSPORT", label: "Passport" },
];
const MAX = 10 * 1024 * 1024;

type Slot = "front" | "back" | "selfie";

/** Upload a photo ID and a selfie so an admin can verify the account (needed to switch roles). */
export default function VerifyIdPage() {
  const router = useRouter();
  const [status, setStatus] = useState<IdStatus | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [docType, setDocType] = useState("DRIVERS_LICENSE");
  const [legalName, setLegalName] = useState("");
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    IdentityService.status()
      .then((res) => {
        setStatus(res.data?.data?.status ?? "NONE");
        setReason(res.data?.data?.rejection_reason ?? null);
      })
      .catch(() => setStatus("NONE"));
  }, []);

  const needsBack = docType !== "PASSPORT";

  const pick = (slot: Slot, file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      return toast.error("Use a photo (JPEG, PNG, WebP or HEIC).");
    }
    if (file.size > MAX) return toast.error("Photos can be up to 10 MB.");
    setFiles((f) => ({ ...f, [slot]: file }));
    setPreviews((p) => ({ ...p, [slot]: URL.createObjectURL(file) }));
  };

  const ready = legalName.trim().length >= 2 && files.front && files.selfie && (!needsBack || files.back);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("document_type", docType);
      form.append("legal_name", legalName.trim());
      form.append("front", files.front!);
      if (needsBack && files.back) form.append("back", files.back);
      form.append("selfie", files.selfie!);
      const res = await IdentityService.submit(form);
      toast.success(res.data?.message ?? "Sent for review");
      router.push("/settings#roles");
    } catch (err: any) {
      const m = err?.response?.data?.message;
      toast.error((Array.isArray(m) ? m[0] : m) || "Couldn't upload. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="py-12 sm:py-20 min-h-screen bg-gray-50 dark:bg-gray-900">
      <Container>
        <div className="max-w-2xl mx-auto">
          <Link href="/settings#roles" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to settings
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">Verify your ID</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
            We check that you are who you say you are before you can switch between customer, vendor and planner.
          </p>

          {status === null ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : status === "APPROVED" ? (
            <Notice icon={<BadgeCheck className="w-6 h-6 text-green-600" />} title="Your ID is verified">
              You can switch roles from <Link href="/settings#roles" className="text-primary font-medium hover:underline">Settings</Link>.
            </Notice>
          ) : status === "PENDING" ? (
            <Notice icon={<Clock className="w-6 h-6 text-amber-600" />} title="We're reviewing your ID">
              This usually takes up to one business day. We&apos;ll send you a notification when it&apos;s done.
            </Notice>
          ) : (
            <form onSubmit={submit} className="space-y-6">
              {status === "REJECTED" && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                  We couldn&apos;t verify your last upload{reason ? `: ${reason}` : "."} Please try again.
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
                <div>
                  <label htmlFor="doc-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document</label>
                  <select
                    id="doc-type"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {DOCS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="legal-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full legal name</label>
                  <input
                    id="legal-name"
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="As it appears on your ID"
                    maxLength={255}
                    autoComplete="name"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PhotoSlot label="Front of ID" hint="All four corners in view, no glare" preview={previews.front} onPick={(f) => pick("front", f)} />
                {needsBack && <PhotoSlot label="Back of ID" hint="The side with the barcode" preview={previews.back} onPick={(f) => pick("back", f)} />}
                <PhotoSlot label="Selfie" hint="Your face, clearly lit, no hat or sunglasses" preview={previews.selfie} onPick={(f) => pick("selfie", f)} selfie />
              </div>

              <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Lock className="w-4 h-4 flex-shrink-0" />
                Your photos are stored privately, seen only by Vendly&apos;s review team, and deleted if you delete your account.
              </p>

              <button
                type="submit"
                disabled={!ready || sending}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                {sending ? "Uploading…" : "Send for review"}
              </button>
            </form>
          )}
        </div>
      </Container>
    </section>
  );
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
      {icon}
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{children}</p>
      </div>
    </div>
  );
}

function PhotoSlot({ label, hint, preview, onPick, selfie }: { label: string; hint: string; preview?: string; onPick: (f?: File) => void; selfie?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      aria-label={preview ? `Change ${label.toLowerCase()} photo` : `Add ${label.toLowerCase()} photo`}
      className="relative aspect-[4/3] rounded-2xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary transition bg-white dark:bg-gray-800 flex flex-col items-center justify-center gap-1 text-center p-3"
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob preview
        <img src={preview} alt={label} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          {selfie ? <Camera className="w-7 h-7 text-gray-400" /> : <IdCard className="w-7 h-7 text-gray-400" />}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
          <span className="text-xs text-gray-400">{hint}</span>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        {...(selfie ? { capture: "user" as const } : {})}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </button>
  );
}
