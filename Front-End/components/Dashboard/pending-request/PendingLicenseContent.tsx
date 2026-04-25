"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminService } from "@/service/admin/admin.service";
import PendingRequestCard from "./PendingRequestCard";
import FailedIcon from "@/icons/FailedIcon";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";

interface Props {
  type: "vendor" | "event_planner";
}

function toCardData(item: any) {
  const docs: string[] = Array.isArray(item.license_photo)
    ? item.license_photo.map((_: any, i: number) => `Document ${i + 1}`)
    : [];

  return {
    businessName: item.business_name || item.name || item.email || "—",
    ownerName: item.name || item.email || "—",
    status: "Pending",
    category: item.type === "EVENT_PLANNER" ? "Event Planner" : "Vendor",
    subscriptionPlan: "Pending Review",
    email: item.email || "—",
    phone: "—",
    submittedDocuments: docs.length > 0 ? docs : ["No documents"],
    requestedOn: item.created_at
      ? new Date(item.created_at).toLocaleDateString()
      : "—",
  };
}

const PendingLicenseContent = ({ type }: Props) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getPendingLicense();
      const data: any[] = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setItems(data);
    } catch {
      toast.error("Failed to load pending requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (userId: string, action: "APPROVED" | "SUSPENDED") => {
    setActioningId(userId);
    try {
      const res = await AdminService.updateLicenseStatus(userId, action);
      if (res.data?.sucess || res.data?.success) {
        toast.success(`License ${action.toLowerCase()} successfully`);
        setItems((prev) => prev.filter((i) => i.id !== userId));
      } else {
        toast.error(res.data?.message || "Action failed");
      }
    } catch {
      toast.error("Action failed. Please try again.");
    } finally {
      setActioningId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-2.5 bg-[#F6F3FF] p-3 rounded-xl border-[0.5px] border-[#EAE3FB]">
        <div className="mt-1">
          <FailedIcon className="text-purpleOne" />
        </div>
        <div>
          <h2 className="text-grayColor2 leading-[160%] text-sm font-medium">Subscription Terms</h2>
          <p className="text-grayColor1 leading-[160%] text-xs font-normal">
            Once approved, subscription terms cannot be edited. Please review all documents carefully.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-gray-400 py-16 text-sm">No pending requests</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((item) => (
            <PendingRequestCard
              key={item.id}
              data={toCardData(item)}
              onApprove={
                actioningId === item.id
                  ? undefined
                  : () => handleAction(item.id, "APPROVED")
              }
              onReject={
                actioningId === item.id
                  ? undefined
                  : () => handleAction(item.id, "SUSPENDED")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingLicenseContent;
