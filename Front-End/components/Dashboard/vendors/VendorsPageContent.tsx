'use client'

import DataFilterBar from "../common/DataFilterBar";
import { vendors } from "@/data/vendors";
import { useState } from "react";
import DynamicTable from "@/components/reusable/DynamicTable";
import { VENDOR_CATEGORY_OPTIONS, VENDOR_COLUMNS } from "./tableConfig";
import { searchLocally } from "@/helper/searchLocally";
import { usePagination } from "@/hooks";

const VendorsPageContent = () => {
  const [filteredData, setFilteredData] = useState(vendors);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [filters, setFilters] = useState({
    search: "",
    category: "all",
    subscription: "all",
  });

  const {
    paginatedData,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
  } = usePagination({
    data: filteredData,
    itemsPerPage: itemsPerPage,
    resetDeps: [filters], 
  });

  const applyFilters = (newFilters: any) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);

    let data = [...vendors];

    if (updated.search) {
      data = searchLocally(updated.search, vendors);
    }

    if (updated.category !== "all") {
      data = data.filter((v) => v.category === updated.category);
    }

    setFilteredData(data);
  };

  return (
    <>
      <DataFilterBar
        onSearch={(q) => applyFilters({ search: q })}
        onCategoryChange={(val) => applyFilters({ category: val })}
        categoryValue={filters.category}
        allCategories
        searchData={vendors}
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
          onView={() => { }}
        />
      </div>
    </>
  );
};

export default VendorsPageContent;