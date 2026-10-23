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

// the backend returns public storage URLs for licence files (public/storage/license, event-planner/license)
function toDocs(photos: unknown) {
  const urls = Array.isArray(photos) ? photos.filter((u): u is string => typeof u === "string" && !!u) : [];
  return urls.length > 0
    ? urls.map((url, i) => ({ label: `Document ${i + 1}`, url }))
    : ["No documents"];
}

// vendor rows come from GET /admin/user/pending-license
function toCardData(item: any) {
  return {
    businessName: item.business_name || item.name || item.email || "—",
    ownerName: item.name || item.email || "—",
    status: "Pending",
    category: item.type === "EVENT_PLANNER" ? "Event Planner" : "Vendor",
    subscriptionPlan: "Pending Review",
    email: item.email || "—",
    phone: "—",
    submittedDocuments: toDocs(item.license_photo),
    requestedOn: item.created_at
      ? new Date(item.created_at).toLocaleDateString()
      : "—",
  };
}

// planner rows are event planner profiles from GET /event-planner/admin/pending
function toPlannerCardData(item: any) {
  return {
    businessName: item.business_name || item.user?.name || item.user?.email || "—",
    ownerName: item.user?.name || item.user?.email || "—",
    status: "Pending",
    category: "Event Planner",
    subscriptionPlan: "Pending Review",
    email: item.user?.email || "—",
    phone: "—",
    submittedDocuments: toDocs(item.license_photo),
    requestedOn: item.created_at
      ? new Date(item.created_at).toLocaleDateString()
      : "—",
  };
}

const PendingLicenseContent = ({ type }: Props) => {
  const isPlanner = type === "event_planner";
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = isPlanner
        ? await AdminService.getPendingEventPlanners({ limit: 100 })
        : await AdminService.getPendingLicense();
      const data: any[] = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setItems(data);
    } catch {
      toast.error("Failed to load pending requests");
    } finally {
      setLoading(false);
    }
  }, [isPlanner]);

  useEffect(() => { load(); }, [load]);

  // vendors are keyed by user id; planner profiles by their user_id
  const userIdOf = (item: any): string => (isPlanner ? item.user_id : item.id);

  const handleAction = async (userId: string, action: "APPROVED" | "SUSPENDED") => {
    setActioningId(userId);
    try {
      const res = isPlanner
        ? await AdminService.updateEventPlannerStatus(userId, action)
        : await AdminService.updateLicenseStatus(userId, action);
      if (res.data?.sucess || res.data?.success) {
        toast.success(
          isPlanner
            ? `Event planner ${action === "APPROVED" ? "approved" : "rejected"}`
            : `License ${action.toLowerCase()} successfully`,
        );
        setItems((prev) => prev.filter((i) => userIdOf(i) !== userId));
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
          {items.map((item) => {
            const userId = userIdOf(item);
            return (
              <PendingRequestCard
                key={item.id}
                data={isPlanner ? toPlannerCardData(item) : toCardData(item)}
                onApprove={
                  actioningId === userId
                    ? undefined
                    : () => handleAction(userId, "APPROVED")
                }
                onReject={
                  actioningId === userId
                    ? undefined
                    : () => handleAction(userId, "SUSPENDED")
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PendingLicenseContent;
