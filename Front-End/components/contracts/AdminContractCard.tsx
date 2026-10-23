"use client";

import ContractBody from "@/components/contracts/ContractBody";
import ContractStatusBadge from "@/components/contracts/ContractStatusBadge";
import { ContractsService, apiError, openContractFile } from "@/service/contracts/contracts.service";

/** One booking contract as an admin sees it: hashes, files, signatures, the text and the audit log. */
export default function AdminContractCard({ contract: c, onError }: { contract: any; onError: (message: string) => void }) {
  const open = (kind: "executed" | "draft") =>
    openContractFile(() => ContractsService.downloadLink(c.id, kind)).catch((e) => onError(apiError(e)));
  return (
    <div className="bg-white rounded-xl border p-5 space-y-3 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">
          Version {c.version} · {c.title}
        </p>
        <ContractStatusBadge status={c.status} />
      </div>
      <div className="text-xs text-gray-500 space-y-0.5 break-all dark:text-gray-400">
        <p>Verification code: {c.verification_code}</p>
        <p>Content hash: {c.content_sha256}</p>
        {c.executed_pdf_sha256 && <p>Executed PDF hash: {c.executed_pdf_sha256}</p>}
        {c.void_reason && <p>Voided: {c.void_reason}</p>}
      </div>
      <div className="flex gap-3 text-sm">
        {c.executed_pdf_key && (
          <button type="button" onClick={() => open("executed")} className="text-primary underline">
            Signed PDF
          </button>
        )}
        <button type="button" onClick={() => open("draft")} className="text-primary underline">
          Contract text
        </button>
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Signatures</p>
        {c.signatures.length ? (
          <table className="w-full text-xs">
            <tbody>
              {c.signatures.map((s: any) => (
                <tr key={s.id} className="border-t dark:border-gray-700 align-top">
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
        ) : (
          <p className="text-xs text-gray-500">Not signed yet.</p>
        )}
      </div>
      {c.rendered_body && (
        <details>
          <summary className="text-sm font-medium cursor-pointer">Read the contract</summary>
          <div className="mt-2 max-h-96 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 text-sm">
            <ContractBody body={c.rendered_body} />
          </div>
        </details>
      )}
      <details>
        <summary className="text-sm font-medium cursor-pointer">Audit log ({c.auditEvents.length})</summary>
        <table className="w-full text-xs mt-2">
          <tbody>
            {c.auditEvents.map((e: any) => (
              <tr key={e.id} className="border-t dark:border-gray-700 align-top">
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
  );
}
