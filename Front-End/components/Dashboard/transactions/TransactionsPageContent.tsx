"use client";

import { useCallback, useEffect, useState } from "react";
import DataFilterBar from "../common/DataFilterBar";
import DynamicTable from "@/components/reusable/DynamicTable";
import { TRANSACTIONS_COLUMNS, TRANSACTION_STATUS_OPTIONS } from "./tableConfig";
import { usePagination } from "@/hooks";
import { AdminService } from "@/service/admin/admin.service";
import { Loader2 } from "lucide-react";

const STATUS_MAP: Record<string, string> = {
  paid: "Successful",
  successful: "Successful",
  failed: "Failed",
  refunded: "Refunded",
};

function toRow(tx: any) {
  return {
    transactionId: `#${tx.id.slice(-10).toUpperCase()}`,
    bookingId: tx.order_id ? `#${String(tx.order_id).slice(-8).toUpperCase()}` : "-",
    payerName: tx.user?.name || tx.user?.email || "-",
    payeeName: "-",
    amount: Number(tx.amount ?? 0),
    platformFee: 0,
    status: STATUS_MAP[String(tx.status || "").toLowerCase()] ?? "Pending",
    dateTime: tx.created_at ? new Date(tx.created_at).toLocaleString() : "-",
  };
}

const TransactionsPageContent = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = rows.filter((r) => {
    if (search && !r.payerName.toLowerCase().includes(search.toLowerCase()) && !r.transactionId.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && statusFilter !== "all" && r.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    return true;
  });

  const { totalItems, totalPages, currentPage, paginatedData, goToPage } =
    usePagination({ data: filtered, itemsPerPage, resetDeps: [filtered] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getTransactions();
      if (Array.isArray(res.data)) {
        setRows(res.data.map(toRow));
      } else if (res.data?.success && Array.isArray(res.data.data)) {
        setRows(res.data.data.map(toRow));
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
      <div className="my-5">
        <DataFilterBar
          onSearch={setSearch}
          onStatusChange={setStatusFilter}
          searchData={[]}
          allStatus
          statusOptions={TRANSACTION_STATUS_OPTIONS}
        />
      </div>
      <DynamicTable
        border={false}
        columns={TRANSACTIONS_COLUMNS}
        data={paginatedData}
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        totalItems={totalItems}
        onPageChange={goToPage}
        totalpage={totalPages}
        setItemsPerPage={setItemsPerPage}
      />
    </div>
  );
};

export default TransactionsPageContent;
