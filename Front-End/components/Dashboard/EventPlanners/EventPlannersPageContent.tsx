"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import DataFilterBar from "../common/DataFilterBar";
import DynamicTable from "@/components/reusable/DynamicTable";
import AccountStatusDialog from "../common/AccountStatusDialog";
import PlannerDetails from "./PlannerDetails";
import {
  EVENT_PLANNERS_COLUMNS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_OPTIONS,
  PLANNER_STATUS_TABS,
  PlannerStatus,
} from "./tableConfig";
import { usePagination } from "@/hooks";
import { AdminService } from "@/service/admin/admin.service";
import { MoneyService } from "@/service/admin/money.service";

interface PlannerRow {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  created_at: string;
  status: number;
  planner_status: PlannerStatus;
  business_name: string | null;
  event_types: string[];
  total_events: number;
  total_bookings: number;
}

type Target = { id: string; name: string; status: number };

const displayName = (p: { business_name?: string | null; name?: string | null; email?: string | null }) =>
  p.business_name || p.name || p.email || "-";

const EventPlannersPageContent = () => {
  const [planners, setPlanners] = useState<PlannerRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<PlannerStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"all" | PlannerStatus>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [viewing, setViewing] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState(0);
  const [confirming, setConfirming] = useState<Target | null>(null);

  // search on the server once typing pauses
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getPlanners({ status, search: query || undefined, limit: 200 });
      setPlanners(res.data?.data ?? []);
      setCounts(res.data?.counts ?? {});
    } catch {
      toast.error("Couldn't load event planners");
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => { load(); }, [load]);

  const rows = planners
    .filter((p) => eventType === "all" || p.event_types.includes(eventType))
    .map((p) => ({
      plannerName: {
        image: p.avatar || "/no-image.jpg",
        name: displayName(p),
        joinedDate: new Date(p.created_at).toLocaleDateString(),
      },
      email: p.email || "-",
      eventTypes: p.event_types.length ? p.event_types.map((t) => EVENT_TYPE_LABELS[t] ?? t).join(", ") : "-",
      totalEvents: p.total_events,
      totalBookings: p.total_bookings,
      status: p.planner_status,
      actions: {
        name: displayName(p),
        suspended: p.status === 0,
        onView: () => setViewing(p.id),
        onToggle: () => setConfirming({ id: p.id, name: displayName(p), status: p.status }),
      },
    }));

  const { paginatedData, currentPage, totalPages, totalItems, goToPage } =
    usePagination({ data: rows, itemsPerPage, resetDeps: [status, query, eventType] });

  // the same account switch the vendor and chat-report pages use: PATCH /admin/users/:id/status
  const saveStatus = async (reason: string) => {
    if (!confirming) return;
    const suspend = confirming.status !== 0;
    try {
      await MoneyService.setUserStatus(confirming.id, suspend ? 0 : 1, reason || undefined);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn't update the account");
      throw e;
    }
    toast.success(suspend ? "Planner suspended" : "Planner reactivated");
    setConfirming(null);
    setDetailKey((k) => k + 1);
    await load();
  };

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2 mb-4">
        {PLANNER_STATUS_TABS.map((t) => {
          const n = t.value === "all" ? total : counts[t.value] ?? 0;
          const active = status === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(t.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition ${active ? "gradient-bg text-white border-transparent" : "border-borderColor text-descriptionColor hover:text-blackColor"}`}
            >
              {t.label} ({n})
            </button>
          );
        })}
      </div>
      <DataFilterBar
        onSearch={setSearch}
        onCategoryChange={setEventType}
        categoryValue={eventType}
        searchData={[]}
        options={EVENT_TYPE_OPTIONS}
        allCategories
      />
      <div className="mt-5">
        <DynamicTable
          columns={EVENT_PLANNERS_COLUMNS}
          data={paginatedData}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          totalpage={totalPages}
          totalItems={totalItems}
          setItemsPerPage={setItemsPerPage}
          border={false}
          loading={loading}
          noDataMessage="No event planners match these filters"
        />
      </div>
      {viewing && (
        <PlannerDetails
          userId={viewing}
          refreshKey={detailKey}
          onClose={() => setViewing(null)}
          onToggleStatus={(p) => setConfirming({ id: p.id, name: p.profile?.business_name || p.name || p.email || "this planner", status: p.status })}
        />
      )}
      {confirming && (
        <AccountStatusDialog
          name={confirming.name}
          suspend={confirming.status !== 0}
          onCancel={() => setConfirming(null)}
          onConfirm={saveStatus}
        />
      )}
    </>
  );
};

export default EventPlannersPageContent;
