"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import ContractBody from "@/components/contracts/ContractBody";
import ContractStatusBadge from "@/components/contracts/ContractStatusBadge";
import { ContractsService, apiError, openContractFile } from "@/service/contracts/contracts.service";

type Tab = "templates" | "vendor" | "booking";

interface Template {
  id: string;
  category: string;
  version: number;
  title: string;
  body: string;
  status: string;
  required_fields: string[];
  created_at: string;
}

const CATEGORIES = ["GENERAL", "PHOTO_VIDEO", "RENTALS", "CATERING", "ENTERTAINMENT", "VENUE", "BEAUTY"];
const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary";

function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<null | { category: string; title: string; body: string }>(null);
  const [viewing, setViewing] = useState<Template | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ContractsService.adminTemplates();
      setTemplates(res.data.data);
    } catch (err) {
      toast.error(apiError(err));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      await load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const saveVersion = async () => {
    if (!editing) return;
    await act(() => ContractsService.adminCreateTemplate(editing), "Draft version created. Activate it to use it for new vendor setups.");
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Each change creates a new version. Contracts already signed never change. Remove the [LAWYER REVIEW] markers only after a
        lawyer approves the text.
      </p>
      {editing ? (
        <div className="space-y-3 bg-white rounded-xl p-5 border">
          <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inputCls} aria-label="Category">
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} aria-label="Title" />
          <textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            rows={24}
            className={`${inputCls} font-mono text-xs`}
            aria-label="Template body"
          />
          <p className="text-xs text-gray-500">
            Use {"{{field}}"} for merge fields and {"{{#field}}…{{/field}}"} for text shown only when the field has a value.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
            <button onClick={saveVersion} className="px-4 py-2 rounded-lg bg-primary text-white text-sm">Save as new draft version</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="p-3">Category</th>
                <th className="p-3">Version</th>
                <th className="p-3">Title</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3">{t.category}</td>
                  <td className="p-3">v{t.version}</td>
                  <td className="p-3">{t.title}</td>
                  <td className="p-3">{t.status}</td>
                  <td className="p-3 flex flex-wrap gap-2 justify-end">
                    <button onClick={() => setViewing(t)} className="text-primary underline">View</button>
                    <button onClick={() => setEditing({ category: t.category, title: t.title, body: t.body })} className="text-primary underline">
                      New version
                    </button>
                    {t.status !== "ACTIVE" && (
                      <button onClick={() => act(() => ContractsService.adminActivateTemplate(t.id), "Activated")} className="text-green-700 underline">
                        Activate
                      </button>
                    )}
                    {t.status !== "RETIRED" && (
                      <button onClick={() => act(() => ContractsService.adminRetireTemplate(t.id), "Retired")} className="text-gray-600 underline">
                        Retire
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 z-10">
            <button onClick={() => setViewing(null)} className="float-right text-sm underline">Close</button>
            <ContractBody body={viewing.body} />
          </div>
        </div>
      )}
    </div>
  );
}

function VendorContractsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("ACTIVE");

  const load = useCallback(async () => {
    try {
      const res = await ContractsService.adminVendorContracts({ type: "UPLOADED", status });
      setRows(res.data.data);
    } catch (err) {
      toast.error(apiError(err));
    }
  }, [status]);
  useEffect(() => {
    load();
  }, [load]);

  const disable = async (id: string) => {
    const reason = window.prompt("Reason for disabling (sent to the vendor):");
    if (!reason || reason.trim().length < 5) return;
    try {
      await ContractsService.adminDisable(id, reason.trim());
      toast.success("Disabled. The vendor was moved to the Vendly default and notified.");
      await load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div className="space-y-3">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} max-w-xs`} aria-label="Status">
        <option value="ACTIVE">Active uploads</option>
        <option value="ARCHIVED">Archived</option>
        <option value="DISABLED">Disabled</option>
      </select>
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="p-3">Vendor</th>
              <th className="p-3">File</th>
              <th className="p-3">Version</th>
              <th className="p-3">Uploaded</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">No uploaded contracts.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  {r.vendor?.name}
                  <div className="text-xs text-gray-400">{r.vendor?.email}</div>
                </td>
                <td className="p-3">{r.file_name}</td>
                <td className="p-3">v{r.version}</td>
                <td className="p-3">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-3 flex gap-3 justify-end">
                  <button
                    onClick={() => openContractFile(() => ContractsService.adminVendorFile(r.id)).catch((e) => toast.error(apiError(e)))}
                    className="text-primary underline"
                  >
                    View PDF
                  </button>
                  {r.status === "ACTIVE" && (
                    <button onClick={() => disable(r.id)} className="text-red-600 underline">
                      Disable
                    </button>
                  )}
                  {r.disabled_reason && <span className="text-xs text-red-600">{r.disabled_reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BookingLookupTab() {
  const [bookingId, setBookingId] = useState("");
  const [contracts, setContracts] = useState<any[] | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingId.trim()) return;
    try {
      const res = await ContractsService.adminBooking(bookingId.trim());
      setContracts(res.data.data);
    } catch (err) {
      setContracts(null);
      toast.error(apiError(err, "No contracts for this booking"));
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={lookup} className="flex gap-2 max-w-xl">
        <input value={bookingId} onChange={(e) => setBookingId(e.target.value)} placeholder="Booking ID" className={inputCls} aria-label="Booking ID" />
        <button className="px-4 py-2 rounded-lg bg-primary text-white text-sm">Look up</button>
      </form>
      <p className="text-xs text-gray-500">Admin views are recorded in each contract&apos;s audit log.</p>
      {contracts?.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">
              Version {c.version} · {c.title}
            </p>
            <ContractStatusBadge status={c.status} />
          </div>
          <div className="text-xs text-gray-500 space-y-0.5 break-all">
            <p>Verification code: {c.verification_code}</p>
            <p>Content hash: {c.content_sha256}</p>
            {c.executed_pdf_sha256 && <p>Executed PDF hash: {c.executed_pdf_sha256}</p>}
          </div>
          <div className="flex gap-3 text-sm">
            {c.executed_pdf_key && (
              <button
                onClick={() => openContractFile(() => ContractsService.downloadLink(c.id, "executed")).catch((e) => toast.error(apiError(e)))}
                className="text-primary underline"
              >
                Signed PDF
              </button>
            )}
            <button
              onClick={() => openContractFile(() => ContractsService.downloadLink(c.id, "draft")).catch((e) => toast.error(apiError(e)))}
              className="text-primary underline"
            >
              Contract text
            </button>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Signatures</p>
            <table className="w-full text-xs">
              <tbody>
                {c.signatures.map((s: any) => (
                  <tr key={s.id} className="border-t align-top">
                    <td className="py-1 pr-2 font-medium">{s.role}</td>
                    <td className="py-1 pr-2">{s.legal_name}</td>
                    <td className="py-1 pr-2">{new Date(s.signed_at).toLocaleString()}</td>
                    <td className="py-1 pr-2">{s.ip_address}</td>
                    <td className="py-1 pr-2">{[s.device_platform, s.app_version].filter(Boolean).join(" ")}</td>
                    <td className="py-1">{s.has_signature_image ? "drawn" : "typed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="text-sm font-medium cursor-pointer">Audit log ({c.auditEvents.length})</summary>
            <table className="w-full text-xs mt-2">
              <tbody>
                {c.auditEvents.map((e: any) => (
                  <tr key={e.id} className="border-t align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="py-1 pr-2 font-medium">{e.action}</td>
                    <td className="py-1 pr-2">{e.actor?.name ?? e.actor_role ?? "system"}</td>
                    <td className="py-1 pr-2">{e.ip_address}</td>
                    <td className="py-1 break-all">{e.details ? JSON.stringify(e.details) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ))}
    </div>
  );
}

export default function AdminContractsPage() {
  const [tab, setTab] = useState<Tab>("templates");
  const tabs: [Tab, string][] = [
    ["templates", "Templates"],
    ["vendor", "Uploaded vendor contracts"],
    ["booking", "Booking contract & audit log"],
  ];
  return (
    <div className="p-4 md:p-6 space-y-5">
      <h1 className="text-2xl font-bold">Contracts</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-full text-sm ${tab === key ? "bg-primary text-white" : "bg-white border"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "templates" && <TemplatesTab />}
      {tab === "vendor" && <VendorContractsTab />}
      {tab === "booking" && <BookingLookupTab />}
    </div>
  );
}
