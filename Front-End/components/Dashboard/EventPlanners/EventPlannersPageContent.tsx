'use client'

import DataFilterBar from "../common/DataFilterBar";
import { useState } from "react";
import DynamicTable from "@/components/reusable/DynamicTable";
import { searchLocally } from "@/helper/searchLocally";
import { usePagination } from "@/hooks";
import { eventPlannersData } from "@/data/events";
import { EVENT_PLANNERS_COLUMNS, EVENT_TYPE_OPTIONS, PLAN_OPTIONS, STATUS_OPTIONS } from "./tableConfig";

const EventPlannersPageContent = () => {
    const [filteredData, setFilteredData] = useState(eventPlannersData);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [filters, setFilters] = useState({
        search: "",
        category: "all",
        subscription: "all",
        plans: "all",
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

        let data = [...eventPlannersData];

        if (updated.search) {
            data = searchLocally(updated.search, eventPlannersData);
        }

        if (updated.category !== "all") {
            data = data.filter((v) => v.eventType === updated.category);
        }

        if (updated.subscription !== "all") {
            console.log(data, "data")
            data = data.filter((v) => v.subscription.toLowerCase() === updated.subscription.toLowerCase());
        }

        if (updated.plans !== "all") {
            data = data.filter((v) => v.services.toLowerCase() === updated.plans.toLowerCase());
        }

        setFilteredData(data);
    };

    return (
        <>
            <DataFilterBar
                onSearch={(q) => applyFilters({ search: q })}
                onCategoryChange={(val) => applyFilters({ category: val })}
                onStatusChange={(val) => applyFilters({ subscription: val })}
                onPlanChange={(val) => applyFilters({ plans: val })}
                categoryValue={filters.category}
                statusValue={filters.subscription}
                planValue={filters.plans}
                searchData={eventPlannersData}
                options={EVENT_TYPE_OPTIONS}
                statusOptions={STATUS_OPTIONS}
                planOptions={PLAN_OPTIONS}
                allCategories
                allStatus
                allPlans
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
                    onView={() => { }}
                />
            </div>
        </>
    );
};

export default EventPlannersPageContent;