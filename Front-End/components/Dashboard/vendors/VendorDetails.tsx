"use client";

import Image from "next/image";
import Link from "next/link";
import ModalWrapper from "../common/modal/ModalWrapper";
import DetailGrid from "../common/DetailGrid";

const LICENCE_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  PENDING: "Waiting for review",
  SUSPENDED: "Rejected",
  NOT_APPLICABLE: "Not sent",
};

/** A vendor from the admin list (GET /admin/user/vendors), with links to their shop and the licence queue. */
export default function VendorDetails({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const suspended = vendor.status === 0;
  return (
    <ModalWrapper isOpen onClose={onClose} size="lg">
      <div role="dialog" aria-modal="true" aria-label="Vendor details" className="p-6 space-y-5">
        <div className="flex items-center gap-4 pr-10">
          <Image src={vendor.avatar || "/no-image.jpg"} alt="" width={56} height={56} className="w-14 h-14 rounded-full object-cover" unoptimized />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-blackColor truncate">{vendor.business_name || vendor.name || vendor.email}</h2>
            <p className="text-sm text-descriptionColor truncate">{[vendor.name, vendor.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <DetailGrid
          items={[
            ["Account", suspended ? "Suspended" : "Active"],
            ["Licence", LICENCE_LABELS[vendor.license_status] ?? vendor.license_status ?? "Not sent"],
            ["Joined", vendor.created_at ? new Date(vendor.created_at).toLocaleDateString() : null],
            ["Address", vendor.address],
            ["Packages", vendor.total_listings ?? 0],
            ["Bookings", vendor.total_bookings ?? 0],
            // their own cancellations (not for non-payment or safety) in the last 90 days; 2 or more ranks them lower in search
            ["Cancellations (90 days)", `${vendor.cancellations_90d ?? 0}${vendor.ranked_lower ? " · shown lower in search" : ""}`],
          ]}
        />
        <div className="flex flex-wrap gap-3 pt-1">
          {/* only approved vendors have a public shop */}
          {vendor.license_status === "APPROVED" && (
            <Link href={`/marketplace/vendors/${vendor.id}`} target="_blank" className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              Open shop page
            </Link>
          )}
          {vendor.license_status === "PENDING" && (
            <Link href="/dashboard/vendors/pending-requests" className="px-4 py-2 rounded-full border border-borderColor text-sm font-semibold text-blackColor">
              Review licence
            </Link>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
