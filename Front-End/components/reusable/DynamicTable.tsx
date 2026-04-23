"use client";

import Image from "next/image";
import React from "react";
import Loader from "./Loader";
import PaginationPage from "./PaginationPage";
import ThreeDotIcon from "@/icons/ThreeDotIcon";
import { useIsMobile } from "@/hooks";

interface ColumnConfig {
  label: React.ReactNode;
  width: any;
  accessor: string;
  formatter?: (value: any, row: any) => React.ReactNode;
}

interface DynamicTableProps {
  columns: any;
  data: any[];
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onView?: (row: any) => void;
  onDelete?: (id: any) => void;
  noDataMessage?: string;
  totalpage: number;
  totalItems?: number;
  setItemsPerPage?: (n: number) => void;
  loading?: boolean;
  error?: string;
  border?: boolean;
  renderFooter?: (colSpan: number) => React.ReactNode;
}

export default function DynamicTable({
  columns,
  data,
  currentPage,
  itemsPerPage,
  border = true,
  onPageChange,
  loading,
  onView,
  totalpage,
  onDelete,
  noDataMessage = "No data found !.",
  totalItems,
  setItemsPerPage,
  error,
  renderFooter,
}: DynamicTableProps) {
  const isMobile = useIsMobile()

  const resolvedWidth = (width: ColumnConfig['width']) => {

    if(typeof width === "object"){
      return isMobile ? width.mobile : width.desktop;
    }

    return width

  }
  return (
    <div>
      {/* Table Wrapper with Border & Radius */}
      <div className={`rounded-t-md ${border ? "border border-gray-200" : ""}`}>
        <div className={` overflow-auto bg-white ${border ? "p-2" : ""}`}>
          <table
            className={`min-w-[1000px] table-fixed w-full text-left bg-whiteColor  ${border ? "p-2" : ""}`}
          >
            <thead className="sticky top-0 text-blackColor rounded-md! overflow-hidden  p-2">
              <tr className="">
                {columns.map((col, index) => {

                  const isFirst = index === 0;
                  const isLast = index === columns.length - 1;

                  return (
                    <th
                      key={col.accessor}
                      style={{ width: resolvedWidth(col.width) || "auto" }}
                      className={`${isFirst ? "rounded-tl-md" : ""} px-4! bg-tableHeaderBg py-5! text-sm font-medium border-b whitespace-nowrap`}
                    >
                      {col.label}
                    </th>
                  )
                })}
                {(onView || onDelete) && (
                  <th className="w-[100px]">
                    <div className="px-4! bg-tableHeaderBg  py-5! text-sm font-medium border-b rounded-tr-md ">
                      Action
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-grayBg">
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length + (onView || onDelete ? 1 : 0)}
                    className="px-4 py-10 text-center text-[#4a4c56] text-sm "
                  >
                    <Loader />
                  </td>
                </tr>
              ) : data?.length > 0 ? (
                data.map((row, i) => (
                  <tr key={i} className="border-t-[0.5px] border-borderColor h-[4.313rem] ">
                    {columns.map((col, idx) => {

                      const value = row[col.accessor];
                      const index = (currentPage - 1) * itemsPerPage + i;
                      return (
                        <td
                          key={col.accessor}
                          style={{ width: resolvedWidth(col.width) || "auto" }}
                          className="px-4 py-3 text-sm font-medium text-blackColor leading-[160%] whitespace-nowrap"
                        >
                          {col.formatter
                            ? col.formatter(
                              value,
                              row,
                              index,
                            )
                            : value}

                        </td>
                      )
                    })}


                    {(onView || onDelete) && (
                      <td className="px-4 py-3 cursor-pointer w-[100px]">
                        {onView && (
                          <ThreeDotIcon />
                        )}
                        {onDelete && (
                          <Image
                            onClick={() => onDelete(row.id)}
                            src="/dashboard/icon/delete.svg"
                            alt="delete"
                            width={16}
                            height={16}
                            className="cursor-pointer"
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length + (onView || onDelete ? 1 : 0)}
                    className="px-4 py-10 text-center text-[#4a4c56] text-sm"
                  >
                    {error ? (
                      <p className="text-red-500 text-xl capitalize font-semibold">
                        {" "}
                        {error + " " + "please login again"}
                      </p>
                    ) : (
                      <p className="text-xl text-gray-500 capitalize font-semibold">
                        {noDataMessage}
                      </p>
                    )}
                  </td>
                </tr>
              )}
              {/* data rows */}
            </tbody>
            {renderFooter && (
              <tfoot>
                {renderFooter(columns.length + (onView || onDelete ? 1 : 0))}
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <div className="mt-3 " >
        <PaginationPage
          totalPages={totalpage}
          dataLength={data?.length || 0}
          totalItems={totalItems}
          onPageChange={onPageChange}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={setItemsPerPage}
        />
      </div>
    </div>
  );
}
