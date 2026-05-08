"use client";

import { useCallback, useEffect, useState } from "react";
import DataFilterBar from "../common/DataFilterBar";
import DynamicTable from "@/components/reusable/DynamicTable";
import { VENDOR_CATEGORY_OPTIONS, VENDOR_COLUMNS } from "./tableConfig";
import { usePagination } from "@/hooks";
import { AdminService } from "@/service/admin/admin.service";
import { Loader2 } from "lucide-react";

function toRow(v: any) {
  return {
    vendorName: {
      image: v.avatar || "/no-image.jpg",
      name: v.business_name || v.name || v.email,
      joinedDate: new Date(v.created_at).toLocaleDateString(),
    },
    category: "Vendor",
    subcategory: "-",
    operatedService: "-",
    location: v.address || "-",
    subscription: v.license_status || "-",
    totalBookings: v.total_bookings ?? 0,
    _raw: v,
  };
}

const VendorsPageContent = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.vendorName.name.toLowerCase().includes(q) ||
      (r._raw.email || "").toLowerCase().includes(q)
    );
  });

  const { paginatedData, currentPage, totalPages, totalItems, goToPage } =
    usePagination({ data: filtered, itemsPerPage, resetDeps: [filtered] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getVendors({ limit: 200 });
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
        onCategoryChange={() => {}}
        categoryValue="all"
        allCategories
        searchData={[]}
        options={VENDOR_CATEGORY_OPTIONS}
      />
      <div className="mt-5">
        <DynamicTable
          columns={VENDOR_COLUMNS}
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

export default VendorsPageContent;
