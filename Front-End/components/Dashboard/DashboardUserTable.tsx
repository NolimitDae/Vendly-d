"use client";

import DynamicTable from "@/components/reusable/DynamicTable";
import { demoData } from "@/public/demoData/DemoData";
import { useState } from "react";

function DashboardUserTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calculate pagination
  const totalItems = demoData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = demoData.slice(startIndex, endIndex);

  // Define table columns
  const columns = [
    {
      label: "Full Name",
      accessor: "full_name",
      width: "180px",
    },
    {
      label: "Email Address",
      accessor: "email_address",
      width: "220px",
    },
    {
      label: "Mobile Number",
      accessor: "mobile_number",
      width: "150px",
    },
    {
      label: "Enquiry Type",
      accessor: "enquiry_type",
      width: "120px",
      formatter: (value: string) => (
        <span className="capitalize px-2 py-1 rounded bg-gray-100 text-xs">
          {value}
        </span>
      ),
    },
    {
      label: "Status",
      accessor: "status",
      width: "140px",
      formatter: (value: string) => {
        const statusColors: Record<string, string> = {
          "Pre Application": "bg-blue-100 text-blue-700",
          Applied: "bg-green-100 text-green-700",
          Pending: "bg-yellow-100 text-yellow-700",
          Inactive: "bg-gray-100 text-gray-700",
        };
        return (
          <span
            className={`capitalize px-2 py-1 rounded text-xs font-medium ${
              statusColors[value] || "bg-gray-100 text-gray-700"
            }`}
          >
            {value}
          </span>
        );
      },
    },
    {
      label: "Additional Info",
      accessor: "additional_information",
      width: "130px",
    },
    {
      label: "Created At",
      accessor: "createdAt",
      width: "120px",
      formatter: (value: string) => {
        const date = new Date(value);
        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      },
    },
  ];

  return (
    <div className="">
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-gray-800">User List</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage and view all registered users
        </p>
      </div>

      <DynamicTable
        columns={columns}
        data={currentData}
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        totalpage={totalPages}
        totalItems={totalItems}
        onPageChange={setCurrentPage}
        setItemsPerPage={setItemsPerPage}
        noDataMessage="No users found"
        loading={false}
      />
    </div>
  );
}

export default DashboardUserTable;
