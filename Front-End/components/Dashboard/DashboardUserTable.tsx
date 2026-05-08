"use client";

import DynamicTable from "@/components/reusable/DynamicTable";
import { AdminService } from "@/service/admin/admin.service";
import { useEffect, useState } from "react";

function DashboardUserTable() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  useEffect(() => {
    setLoading(true);
    AdminService.getVendors({ page: currentPage, limit: itemsPerPage })
      .then((res) => {
        if (res.data?.success) {
          setData(res.data.data ?? []);
          setTotalItems(res.data.meta?.total ?? 0);
        }
      })
      .finally(() => setLoading(false));
  }, [currentPage]);

  const columns = [
    { label: "Name", accessor: "name", width: "180px" },
    { label: "Email", accessor: "email", width: "220px" },
    { label: "Business", accessor: "business_name", width: "180px" },
    {
      label: "Status",
      accessor: "license_status",
      width: "130px",
      formatter: (value: string) => {
        const colors: Record<string, string> = {
          APPROVED: "bg-green-100 text-green-700",
          PENDING: "bg-yellow-100 text-yellow-700",
          SUSPENDED: "bg-red-100 text-red-700",
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${colors[value] ?? "bg-gray-100 text-gray-700"}`}>
            {value ?? "—"}
          </span>
        );
      },
    },
    { label: "Listings", accessor: "total_listings", width: "100px" },
  ];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-gray-800">Vendor List</h2>
        <p className="text-sm text-gray-500 mt-1">All registered vendors</p>
      </div>
      <DynamicTable
        columns={columns}
        data={data}
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        totalpage={Math.ceil(totalItems / itemsPerPage)}
        totalItems={totalItems}
        onPageChange={setCurrentPage}
        setItemsPerPage={() => {}}
        noDataMessage="No vendors found"
        loading={loading}
      />
    </div>
  );
}

export default DashboardUserTable;
