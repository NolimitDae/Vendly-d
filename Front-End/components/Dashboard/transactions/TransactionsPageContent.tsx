"use client";

import React, { useState } from "react";
import DataFilterBar from "../common/DataFilterBar";
import DynamicTable from "@/components/reusable/DynamicTable";
import { transactionsData } from "@/data/transactions";
import {
  TRANSACTION_STATUS_OPTIONS,
  TRANSACTIONS_COLUMNS,
} from "./tableConfig";
import { usePagination } from "@/hooks";
import { searchLocally } from "@/helper/searchLocally";

const TransactionsPageContent = () => {
  const [filteredData, setFilterData] = useState(transactionsData);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filters, setFilters] = useState({ search: "", status: "all" });

  const { totalItems, totalPages, currentPage, paginatedData, goToPage } =
    usePagination({ data: filteredData, itemsPerPage, resetDeps: [filters] });

  const applyFilters = (newFilters: any) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);

    let data = [...transactionsData];

    if (updated.search) {
      data = searchLocally(updated.search, transactionsData);
    }

    if (updated.status && updated.status !== "all") {
      data = data.filter(
        (v) => v.status.toLowerCase() === updated.status.toLowerCase(),
      );
    }

    setFilterData(data);
  };

  return (
    <div>
      {" "}
      <div className="my-5">
        <DataFilterBar
          onSearch={(q) => applyFilters({ search: q })}
          onStatusChange={(s) => applyFilters({ status: s })}
          searchData={transactionsData}
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
