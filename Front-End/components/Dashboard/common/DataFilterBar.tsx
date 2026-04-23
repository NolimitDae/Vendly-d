"use client";

import { searchLocally } from "@/helper/searchLocally";
import { GenericSearch } from "../search/GenericSearch";
import GenericSelect from "./GenericSelectInput";
import FunnelIcon from "@/icons/FunnelIcon";

interface DataFilterBarProps {
  onSearch: (query: string) => void;
  allCategories?: boolean;
  categoryValue?: string;
  onCategoryChange?: (category: string) => void;
  allStatus?: boolean;
  statusValue?: string;
  onStatusChange?: (status: string) => void;
  allPlans?: boolean;
  planValue?: string;
  onPlanChange?: (plan: string) => void;
  allPayments?: boolean;
  paymentValue?: string;
  onPaymentChange?: (payment: string) => void;
  searchData?: any[];
  options?: any[];
  statusOptions?: any[];
  planOptions?: any[];
  paymentOptions?: any[];
}

const DataFilterBar = ({
  onSearch,
  onCategoryChange,
  categoryValue,
  allCategories,
  allStatus,
  statusValue,
  onStatusChange,
  allPlans,
  planValue,
  onPlanChange,
  allPayments,
  paymentValue,
  onPaymentChange,
  searchData = [],
  options = [],
  statusOptions,
  planOptions,
  paymentOptions,
}: DataFilterBarProps) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center bg-grayBg p-3 rounded-xl gap-2">
      {/* Search */}
      <GenericSearch
        onSearch={(q) => searchLocally(q, searchData)}
        onChange={onSearch}
        onClear={() => onSearch("")}
        debounceMs={10}
        placeholder="Search Vendor"
        minChars={1}
        onSelect={(item: any) =>
          console.log(item.vendorName?.name || item.plannerName?.name)
        }
        renderResult={(item: any) => (
          <div className="flex items-center gap-3 px-3 py-2.5 w-full">
            {(item.vendorName?.image ||
              item.plannerName?.image ||
              item?.info?.image) && (
              <img
                src={
                  item.vendorName?.image ||
                  item.plannerName?.image ||
                  item?.info?.image
                }
                alt={
                  item.vendorName?.name ||
                  item.plannerName?.name ||
                  item?.info?.eventName
                }
                className="w-8 h-8 rounded-full object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-gray-900 truncate">
                {item.vendorName?.name ||
                  item.plannerName?.name ||
                  item?.info?.eventName ||
                  item.payerName ||
                  item.payeeName}
              </div>
              <div className="text-[12px] text-gray-500 truncate">
                {item.category || item.eventType} •{" "}
                {item.location ||
                  item.services ||
                  item?.info?.date ||
                  item.transactionId}
              </div>
            </div>
          </div>
        )}
        className="w-full sm:w-[12rem] md:w-[31.25rem]"
        size="sm"
      />

      {/* Filters */}
      <div className="flex flex-col w-full gap-2 sm:flex-row sm:w-auto">
        {allCategories && (
          <GenericSelect
            placeholder="All Categories"
            value={categoryValue}
            onValueChange={onCategoryChange}
            searchable={true}
            options={options}
            textSize="text-xs"
            textColor="text-descriptionColor"
            placeholderColor="text-grayColor2 font-medium"
            borderWidth="border-[0.5px]"
            shadow="shadow-none"
            hoverTextColor="hover:text-purpleTwo"
            dropdownShadow="shadow-none"
            itemHoverText="focus:text-purpleOne"
            leftIcon={<FunnelIcon />}
            width="w-full sm:w-[12rem] md:w-[16rem]"
          />
        )}

        {allStatus && (
          <GenericSelect
            options={statusOptions}
            value={statusValue}
            onValueChange={onStatusChange}
            placeholder="All Status"
            width="w-full sm:w-[12rem] md:w-[16rem]"
            textSize="text-xs"
            textColor="text-descriptionColor"
            placeholderColor="text-grayColor2 font-medium"
            borderWidth="border-[0.5px]"
            shadow="shadow-none"
            hoverTextColor="hover:text-purpleTwo"
            dropdownShadow="shadow-none"
            itemHoverText="focus:text-purpleOne"
          />
        )}

        {allPlans && (
          <GenericSelect
            options={planOptions}
            value={planValue}
            onValueChange={onPlanChange}
            placeholder="All Plans"
            width="w-full sm:w-[12rem] md:w-[16rem]"
            textSize="text-xs"
            textColor="text-descriptionColor"
            placeholderColor="text-grayColor2 font-medium"
            borderWidth="border-[0.5px]"
            shadow="shadow-none"
            hoverTextColor="hover:text-purpleTwo"
            dropdownShadow="shadow-none"
            itemHoverText="focus:text-purpleOne"
          />
        )}

        {allPayments && (
          <GenericSelect
            options={paymentOptions}
            value={paymentValue}
            onValueChange={onPaymentChange}
            placeholder="All Payments"
            width="w-full sm:w-[12rem] md:w-[16rem]"
            textSize="text-xs"
            textColor="text-descriptionColor"
            placeholderColor="text-grayColor2 font-medium"
            borderWidth="border-[0.5px]"
            shadow="shadow-none"
            hoverTextColor="hover:text-purpleTwo"
            dropdownShadow="shadow-none"
            itemHoverText="focus:text-purpleOne"
          />
        )}
      </div>
    </div>
  );
};

export default DataFilterBar;
