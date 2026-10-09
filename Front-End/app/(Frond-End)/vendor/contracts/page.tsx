"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Eye, FileSignature, FileUp, Loader2, Pencil, Sparkles } from "lucide-react";
import { toast } from "react-toastify";
import ContractBody from "@/components/contracts/ContractBody";
import { ContractsService, apiError, openContractFile } from "@/service/contracts/contracts.service";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "money" | "number" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface Template {
  id: string;
  category: string;
  category_label: string;
  version: number;
  title: string;
  fields: FieldDef[];
}

interface VendorContract {
  id: string;
  type: "DEFAULT" | "UPLOADED";
  version: number;
  status: string;
  template: { category: string; version: number; title: string } | null;
  field_values: Record<string, string>;
  additional_terms: string | null;
  file_name: string | null;
  applies_to_all: boolean;
  listing_ids: string[];
  disabled_reason: string | null;
  created_at: string;
}

type Mode = { kind: "none" } | { kind: "default"; replaceId?: string } | { kind: "upload"; replaceId?: string };

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

function FieldInput({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `f-${def.key}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {def.label}
        {def.required && <span className="text-red-500"> *</span>}
      </label>
      {def.type === "select" ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Choose…</option>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.type === "textarea" ? (
        <textarea id={id} rows={3} value={value} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-none`} />
      ) : (
        <input
          id={id}
          type={def.type === "money" || def.type === "number" ? "number" : "text"}
          min={def.type === "money" || def.type === "number" ? 0 : undefined}
          step={def.type === "money" ? "0.01" : undefined}
          value={value}
          placeholder={def.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      )}
    </div>
  );
}

export default function VendorContractsPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [uploadFields, setUploadFields] = useState<FieldDef[]>([]);
  const [maxTerms, setMaxTerms] = useState(3000);
  const [active, setActive] = useState<VendorContract[]>([]);
  const [history, setHistory] = useState<VendorContract[]>([]);
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [busy, setBusy] = useState(false);

  // form state shared by both options
  const [category, setCategory] = useState("GENERAL");
  const [values, setValues] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState("");
  const [appliesToAll, setAppliesToAll] = useState(true);
  const [listingIds, setListingIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [confirmOwn, setConfirmOwn] = useState(false);
  const [preview, setPreview] = useState<{ body: string; missing: string[] } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [t, mine, l] = await Promise.all([
        ContractsService.templates(),
        ContractsService.vendorList(),
        VendorListingService.getMyListings({ limit: 100 }),
      ]);
      setTemplates(t.data.data.templates);
      setUploadFields(t.data.data.upload_fields);
      setMaxTerms(t.data.data.max_additional_terms);
      setActive(mine.data.data.active);
      setHistory(mine.data.data.history);
      setListings((l.data?.data ?? []).map((x: any) => ({ id: x.id, title: x.title })));
    } catch (err) {
      toast.error(apiError(err, "Couldn't load contracts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const template = templates.find((t) => t.category === category);

  // live preview with sample booking data
  useEffect(() => {
    if (mode.kind !== "default" || !template) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await ContractsService.vendorPreview({ category, field_values: values, additional_terms: terms || undefined });
        setPreview({ body: res.data.data.body, missing: res.data.data.missing_fields });
      } catch {
        /* preview is best-effort */
      }
    }, 500);
    return () => clearTimeout(previewTimer.current);
  }, [mode.kind, category, values, terms, template]);

  const startForm = (kind: "default" | "upload", from?: VendorContract) => {
    setMode({ kind, replaceId: from?.id });
    setCategory(from?.template?.category ?? "GENERAL");
    setValues(from?.field_values ?? {});
    setTerms(from?.additional_terms ?? "");
    setAppliesToAll(from ? from.applies_to_all : true);
    setListingIds(from?.listing_ids ?? []);
    setFile(null);
    setConfirmOwn(false);
    setPreview(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const useDefault = async () => {
    setBusy(true);
    try {
      await ContractsService.vendorUseDefault();
      toast.success("You're using the Vendly default contract. Review and customise it any time.");
      await load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveDefault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind !== "default") return;
    setBusy(true);
    const dto = {
      category,
      field_values: values,
      additional_terms: terms || undefined,
      applies_to_all: appliesToAll,
      listing_ids: appliesToAll ? [] : listingIds,
    };
    try {
      if (mode.replaceId) await ContractsService.vendorReplaceDefault(mode.replaceId, dto);
      else await ContractsService.vendorCreateDefault(dto);
      toast.success("Contract saved. It applies to new bookings; signed bookings keep their version.");
      setMode({ kind: "none" });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save the contract"));
    } finally {
      setBusy(false);
    }
  };

  const saveUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind !== "upload") return;
    if (!file) return toast.error("Choose your contract PDF");
    if (file.size > 10 * 1024 * 1024) return toast.error("The PDF must be 10 MB or smaller.");
    const form = new FormData();
    form.append("file", file);
    form.append("confirm_ownership", String(confirmOwn));
    form.append("field_values", JSON.stringify(values));
    form.append("applies_to_all", String(appliesToAll));
    if (!appliesToAll) form.append("listing_ids", JSON.stringify(listingIds));
    setBusy(true);
    try {
      if (mode.replaceId) await ContractsService.vendorReplaceUpload(mode.replaceId, form);
      else await ContractsService.vendorUpload(form);
      toast.success("Contract uploaded. Vendly adds a booking addendum and signature page to each booking.");
      setMode({ kind: "none" });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Upload failed"));
    } finally {
      setBusy(false);
    }
  };

  const archive = async (id: string) => {
    if (!confirm("Archive this contract? Future bookings will use your other active contract or the Vendly default.")) return;
    try {
      await ContractsService.vendorArchive(id);
      await load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const assignment = (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Applies to</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" checked={appliesToAll} onChange={() => setAppliesToAll(true)} className="accent-primary" /> All my listings
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" checked={!appliesToAll} onChange={() => setAppliesToAll(false)} className="accent-primary" /> Selected listings
      </label>
      {!appliesToAll && (
        <div className="pl-6 space-y-1 max-h-40 overflow-y-auto">
          {listings.length === 0 && <p className="text-xs text-gray-500">You have no listings yet.</p>}
          {listings.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={listingIds.includes(l.id)}
                onChange={(e) =>
                  setListingIds((ids) => (e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id)))
                }
              />
              {l.title}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const listingName = (id: string) => listings.find((l) => l.id === id)?.title ?? "Listing";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contracts</h1>
            <p className="text-sm text-gray-500">Customers sign your contract when they request a booking. You countersign when you Accept &amp; Sign.</p>
          </div>
          {mode.kind === "none" && (
            <div className="flex gap-2">
              <button onClick={() => startForm("default")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm">
                <FileSignature className="w-4 h-4" /> Set up Vendly default
              </button>
              <button onClick={() => startForm("upload")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm bg-white dark:bg-gray-800">
                <FileUp className="w-4 h-4" /> Upload my own PDF
              </button>
            </div>
          )}
        </div>

        {active.length === 0 && mode.kind === "none" && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-sm text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3">
            <span>You need an active contract before accepting paid bookings.</span>
            <button onClick={useDefault} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-60">
              <Sparkles className="w-4 h-4" /> Use Vendly default
            </button>
          </div>
        )}

        {mode.kind === "default" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <form onSubmit={saveDefault} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
              <h2 className="font-semibold">{mode.replaceId ? "Edit contract (creates a new version)" : "Vendly default contract"}</h2>
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                  {templates.map((t) => (
                    <option key={t.category} value={t.category}>
                      {t.category_label}
                    </option>
                  ))}
                </select>
              </div>
              {template?.fields.map((f) => (
                <FieldInput key={f.key} def={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
              ))}
              <div>
                <label htmlFor="terms" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional terms (optional)</label>
                <textarea id="terms" rows={5} maxLength={maxTerms} value={terms} onChange={(e) => setTerms(e.target.value)} className={`${inputCls} resize-none`} />
                <p className="text-xs text-gray-400 text-right">
                  {terms.length}/{maxTerms}
                </p>
              </div>
              {assignment}
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode({ kind: "none" })} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
                <button type="submit" disabled={busy} className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-60">
                  {busy ? "Saving…" : "Save contract"}
                </button>
              </div>
            </form>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 lg:sticky lg:top-24 h-fit max-h-[80vh] overflow-y-auto">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Live preview · sample booking</p>
              {preview?.missing.length ? (
                <p className="text-xs text-amber-600 mb-3">Still needed: {preview.missing.join(", ")}</p>
              ) : null}
              {preview ? <ContractBody body={preview.body} /> : <Loader2 className="w-5 h-5 animate-spin text-primary" />}
            </div>
          </div>
        )}

        {mode.kind === "upload" && (
          <form onSubmit={saveUpload} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4 max-w-2xl">
            <h2 className="font-semibold">{mode.replaceId ? "Replace uploaded contract (creates a new version)" : "Upload your own contract"}</h2>
            <p className="text-sm text-gray-500">
              PDF only, up to 10 MB, not password-protected. Vendly adds a booking addendum (event, price, cancellation terms and the
              platform terms clause) and a signature certificate to each booking. No signature fields are needed in your PDF.
            </p>
            <input
              type="file"
              accept="application/pdf"
              aria-label="Contract PDF"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm"
            />
            {uploadFields.map((f) => (
              <FieldInput key={f.key} def={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ))}
            {assignment}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-primary" checked={confirmOwn} onChange={(e) => setConfirmOwn(e.target.checked)} />
              This contract is mine to use, and it doesn&apos;t conflict with the Vendly Terms of Service.
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode({ kind: "none" })} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button type="submit" disabled={busy || !confirmOwn} className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-60">
                {busy ? "Uploading…" : "Upload contract"}
              </button>
            </div>
          </form>
        )}

        {mode.kind === "none" && (
          <>
            <div className="space-y-3">
              {active.map((c) => (
                <div key={c.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {c.type === "UPLOADED" ? `Uploaded: ${c.file_name}` : c.template?.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      Version {c.version} · {new Date(c.created_at).toLocaleDateString()} ·{" "}
                      {c.applies_to_all ? "All listings" : c.listing_ids.map(listingName).join(", ")}
                    </p>
                    {c.field_values?.cancellation_policy && (
                      <p className="text-xs text-gray-500">Cancellation: {c.field_values.cancellation_policy}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {c.type === "UPLOADED" && (
                      <button
                        onClick={() => openContractFile(() => ContractsService.vendorFile(c.id)).catch((e) => toast.error(apiError(e)))}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm"
                      >
                        <Eye className="w-4 h-4" /> View
                      </button>
                    )}
                    <button
                      onClick={() => startForm(c.type === "UPLOADED" ? "upload" : "default", c)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm"
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </button>
                    <button onClick={() => archive(c.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm text-gray-600">
                      <Archive className="w-4 h-4" /> Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {history.length > 0 && (
              <details className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                <summary className="cursor-pointer text-sm font-medium">Earlier versions ({history.length})</summary>
                <ul className="mt-3 space-y-2 text-sm">
                  {history.map((c) => (
                    <li key={c.id} className="flex flex-wrap gap-2 text-gray-600 dark:text-gray-300">
                      <span>
                        Version {c.version} · {c.type === "UPLOADED" ? c.file_name : c.template?.title}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">{c.status.toLowerCase()}</span>
                      {c.disabled_reason && <span className="text-xs text-red-600">Disabled by Vendly: {c.disabled_reason}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
