"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AuthService } from "@/service/auth/auth.service";

/** The licence half of the API's rule: an approved licence (or social page / website screenshot), or an admin saying none is needed. */
export const canPublish = (status?: string | null) => status === "APPROVED" || status === "NOT_APPLICABLE";

/**
 * A short note for vendors who can't publish yet: their business licence isn't approved, or (the
 * other half of the rule) their photo ID isn't verified, with a link to fix it. Shows nothing for
 * vendors who can publish, or while the account is loading.
 */
export default function LicenceNotice({ things = "packages" }: { things?: string }) {
  const [licence, setLicence] = useState<{ status: string | null; uploaded: boolean; idVerified: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    AuthService.me()
      .then((res) => {
        const d = res.data?.success ? res.data.data : null;
        if (alive && d && d.type === "VENDOR") setLicence({ status: d.license_status ?? null, uploaded: !!d.license_uploaded, idVerified: d.id_verified !== false });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!licence || (canPublish(licence.status) && licence.idVerified)) return null;

  if (canPublish(licence.status)) {
    return (
      <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
        <p>
          To publish {things} you also need a verified photo ID: a driver&apos;s license, passport or another government ID. You can still save drafts.{" "}
          <Link href="/settings/verify-id" className="font-semibold underline">
            Verify your ID
          </Link>
        </p>
      </div>
    );
  }

  const reviewing = licence.uploaded && licence.status !== "SUSPENDED";
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
      <p>
        {reviewing
          ? `Vendly is reviewing your business licence. You can save ${things} as drafts now and publish them once it’s approved.`
          : licence.status === "SUSPENDED"
            ? `Your business licence needs attention. Upload it again so you can publish ${things}; drafts still save.`
            : `You need an approved business licence to publish ${things} (no licence? a screenshot of your business's social media page or website works). You can still save drafts.`}{" "}
        <Link href="/vendor/profile#licence" className="font-semibold underline">
          {reviewing ? "View your licence" : "Upload your licence"}
        </Link>
      </p>
    </div>
  );
}
