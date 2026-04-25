"use client";

import { useCallback, useEffect, useState } from "react";
import DynamicTable from "@/components/reusable/DynamicTable";
import GenericButton from "../auth/GenericButton";
import DataFilterBar from "../common/DataFilterBar";
import { BOOKING_COLUMNS, BOOKING_STATUS_OPTIONS, BOOKING_PAYMENT_OPTIONS } from "./tableConfig";
import { usePagination } from "@/hooks";
import { AdminService } from "@/service/admin/admin.service";
import { Loader2 } from "lucide-react";

const PAYMENT_MAP: Record<string, string> = {
  COMPLETED: "Paid",
  CANCELLED: "Refunded",
};

const STATUS_MAP: Record<string, string> = {
  COMPLETED: "Complete",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending",
  CONFIRMED: "Pending",
  CANCELLED: "Pending",
  REJECTED: "Pending",
};

function toRow(b: any) {
  return {
    bookingId: `#${b.id.slice(-8).toUpperCase()}`,
    info: {
      image: b.listing?.images?.[0] || "/no-image.jpg",
      eventName: b.listing?.title || "Service",
      date: new Date(b.created_at).toLocaleDateString(),
    },
    customer: b.customer?.name || b.customer?.email || "-",
    totalVendor: b.vendor?.name || "-",
    eventDate: b.scheduled_at ? new Date(b.scheduled_at).toLocaleDateString() : "-",
    amount: b.amount ? `$${Number(b.amount).toFixed(2)}` : "-",
    payment: PAYMENT_MAP[b.status] ?? "Pending",
    status: STATUS_MAP[b.status] ?? "Pending",
  };
}

const BookingsPageContent = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = rows.filter((r) => {
    if (search && !r.customer.toLowerCase().includes(search.toLowerCase()) && !r.bookingId.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && statusFilter !== "all" && r.status.toLowerCase().replace(" ", "-") !== statusFilter) return false;
    return true;
  });

  const { paginatedData, currentPage, totalPages, totalItems, goToPage } =
    usePagination({ data: filtered, itemsPerPage, resetDeps: [filtered] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getBookings({ limit: 200 });
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
    <div>
      <DataFilterBar
        statusOptions={BOOKING_STATUS_OPTIONS}
        paymentOptions={BOOKING_PAYMENT_OPTIONS}
        searchData={[]}
        onSearch={setSearch}
        onStatusChange={setStatusFilter}
        onPaymentChange={() => {}}
        allStatus
        allPayments
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-1 rounded-[1.25rem] mt-5 gap-1 bg-grayBg">
        <GenericButton variant="primary" size="xl" rounded="2xl">Event based booking</GenericButton>
        <GenericButton variant="plain" size="xl" rounded="2xl">Home based booking</GenericButton>
        <GenericButton variant="plain" size="xl" rounded="2xl">Location based booking</GenericButton>
      </div>
      <div className="mt-6">
        <DynamicTable
          border={false}
          data={paginatedData}
          columns={BOOKING_COLUMNS}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          totalpage={totalPages}
          totalItems={totalItems}
          setItemsPerPage={setItemsPerPage}
          onView={() => {}}
        />
      </div>
    </div>
  );
};

export default BookingsPageContent;
