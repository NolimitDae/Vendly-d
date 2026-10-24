"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AuthService } from "@/service/auth/auth.service";

/** Same rule as the API: an approved licence, or an admin saying none is needed. */
export const canPublish = (status?: string | null) => status === "APPROVED" || status === "NOT_APPLICABLE";

/**
 * A short note for vendors who can't publish yet because their business licence isn't approved,
 * with a link to upload it. Shows nothing for approved vendors, or while the account is loading.
 */
export default function LicenceNotice({ things = "packages" }: { things?: string }) {
  const [licence, setLicence] = useState<{ status: string | null; uploaded: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    AuthService.me()
      .then((res) => {
        const d = res.data?.success ? res.data.data : null;
        if (alive && d && d.type === "VENDOR") setLicence({ status: d.license_status ?? null, uploaded: !!d.license_uploaded });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!licence || canPublish(licence.status)) return null;

  const reviewing = licence.uploaded && licence.status !== "SUSPENDED";
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
      <p>
        {reviewing
          ? `Vendly is reviewing your business licence. You can save ${things} as drafts now and publish them once it’s approved.`
          : licence.status === "SUSPENDED"
            ? `Your business licence needs attention. Upload it again so you can publish ${things}; drafts still save.`
            : `You need an approved business licence to publish ${things}. You can still save drafts.`}{" "}
        <Link href="/vendor/profile#licence" className="font-semibold underline">
          {reviewing ? "View your licence" : "Upload your licence"}
        </Link>
      </p>
    </div>
  );
}
