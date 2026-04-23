"use client";

import VendorsIcon from "@/icons/VendorsIcon";
import { Skeleton } from "../ui/skeleton";
import GrowIcon from "@/icons/GrowIcon";

interface StatCardProps {
  title: string;
  value: number;
  percentage?: string;
  icon?: React.ReactNode;
}

const SECTION_GRID_CONFIG: Record<string, string> = {
  services: "lg:grid-cols-3",
  vendors: "lg:grid-cols-4",
  dashboard: "lg:grid-cols-4",
};

export default function StatCards({
  statCards,
  section,
}: {
  statCards: StatCardProps[];
  section?: string;
}) {
  const isLoading = false;
  const isServices = section === "services";
  const gridCols = SECTION_GRID_CONFIG[section || ""] || "lg:grid-cols-4";

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${gridCols} ${isServices ? "gap-5" : "gap-3"}`}
    >
      {isLoading
        ? Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-lg bg-white border border-gray-100 flex flex-col gap-4"
            >
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-16 h-8" />
              <Skeleton className="w-12 h-4" />
            </div>
          ))
        : statCards.map((card, idx) => (
            <div
              key={idx}
              className={` ${isServices ? "p-5" : "p-4 "} bg-grayBg rounded-xl`}
            >
              {/* Title */}
              {section !== "services" && (
                <div className="flex items-center gap-2">
                  {card.icon}
                  <p className="text-descriptionColor font-medium leading-[160%]">
                    {card.title}
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <div
                    className={`${isServices ? "mb-[.563rem]" : "mb-0"} text-blackColor text-xl font-semibold leading-[130%]`}
                  >
                    195
                  </div>
                  {section !== "services" && (
                    <div className="flex px-1.5 py-1   items-center gap-1 border-[0.5px] border-greenBorder bg-greenBg rounded-4xl">
                      {" "}
                      <GrowIcon />
                      <span className="text-greenText ">0.1%</span>
                    </div>
                  )}
                </div>
                <p className="text-grayColor1 leading-[160%] text-sm">
                  From Last Month
                </p>
              </div>
            </div>
          ))}
    </div>
  );
}
