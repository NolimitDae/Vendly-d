"use client";

import { useCallback, useEffect, useState } from "react";
import DataFilterBar from "../common/DataFilterBar";
import DynamicTable from "@/components/reusable/DynamicTable";
import { EVENT_PLANNERS_COLUMNS, EVENT_TYPE_OPTIONS, STATUS_OPTIONS } from "./tableConfig";
import { usePagination } from "@/hooks";
import { AdminService } from "@/service/admin/admin.service";
import { Loader2 } from "lucide-react";

function toRow(ep: any) {
  const user = ep.user || {};
  return {
    plannerName: {
      image: user.avatar || "/no-image.jpg",
      name: ep.business_name || user.name || user.email || "-",
      joinedDate: ep.created_at ? new Date(ep.created_at).toLocaleDateString() : "-",
    },
    eventType: Array.isArray(ep.event_types) && ep.event_types.length > 0
      ? ep.event_types[0].replace("_", " ")
      : "-",
    services: ep.team_size ? `Team of ${ep.team_size}` : "-",
    subscription: ep.license_status || "-",
    totalBookings: ep.years_experience ? `${ep.years_experience}y exp` : "-",
    _raw: ep,
  };
}

const EventPlannersPageContent = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = rows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.plannerName.name.toLowerCase().includes(q)) return false;
    }
    if (eventTypeFilter && eventTypeFilter !== "all") {
      if (r.eventType.toLowerCase() !== eventTypeFilter.toLowerCase()) return false;
    }
    return true;
  });

  const { paginatedData, currentPage, totalPages, totalItems, goToPage } =
    usePagination({ data: filtered, itemsPerPage, resetDeps: [filtered] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getEventPlanners({ limit: 200 });
      if (res.data?.success) {
        setRows((res.data.data as any[]).map(toRow));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <DataFilterBar
        onSearch={setSearch}
        onCategoryChange={setEventTypeFilter}
        categoryValue={eventTypeFilter}
        searchData={[]}
        options={EVENT_TYPE_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        allCategories
        allStatus
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
          onView={() => {}}
        />
      </div>
    </>
  );
};

export default EventPlannersPageContent;
