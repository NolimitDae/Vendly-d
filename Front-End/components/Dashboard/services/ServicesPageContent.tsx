"use client";
import React, { useState } from "react";
import StatCards from "../StateCards";
import statscard from "../StateCards";
import { VendorsIcon } from "@/icons";
import DynamicTable from "@/components/reusable/DynamicTable";
import { SERVICES_COLUMNS } from "./tableConfig";
import { servicesData } from "@/data/services";
import { usePagination } from "@/hooks";
const statCards = [
  {
    title: "Total Services",
    value: 195,
  },
  {
    title: "Active Services",
    value: 7,
  },
  {
    title: "Cancelled Services",
    value: 18,
  },
];
const ServicesPageContent = () => {
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const { totalItems, goToPage, currentPage, totalPages, paginatedData } =
    usePagination({
      data: servicesData,
      itemsPerPage,
      resetDeps: [],
    });
  return (
    <>
      <StatCards statCards={statCards} section="services" />

      <div>
        <div className="space-y-1 p-4 bg-grayBg rounded-t-xl mt-5">
          <h2 className="text-blackColor text-lg leading-[130%] font-medium">
            All Service
          </h2>
          <p className="text-descriptionColor text-sm leading-[160%]">
            Manage platform service categories and commission rates
          </p>
        </div>
        <DynamicTable
          border={false}
          columns={SERVICES_COLUMNS}
          data={paginatedData}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalItems={totalItems}
          onPageChange={goToPage}
          totalpage={totalPages}
          onView={() => {}}
          setItemsPerPage={setItemsPerPage}
        />
      </div>
    </>
  );
};

export default ServicesPageContent;
