"use client";

import SelectInputField from "@/components/reusable/InputFiled/SelectInputField";
import React, { useEffect, useState } from "react";
import SimpleAreaChart from "./AreaChart";
import { AdminService } from "@/service/admin/admin.service";

interface MonthPoint {
  name: string;
  amount: number;
}

const ReveneuOverview = () => {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [chartData, setChartData] = useState<MonthPoint[]>([]);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2].map((y) => ({
    label: String(y),
    value: String(y),
  }));

  useEffect(() => {
    AdminService.getRevenueByMonth(Number(year))
      .then((res) => {
        if (res.data?.success) setChartData(res.data.data);
      })
      .catch(() => {});
  }, [year]);

  return (
    <div className="bg-grayBg p-4 rounded-xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-blackColor text-lg font-semibold leading-[160%]">Revenue Overview</h3>
          <p className="text-descriptionColor leading-[160%]">Monthly revenue analytics</p>
        </div>
        <div>
          <SelectInputField
            options={yearOptions}
            placeholder={year}
            className="border-0 shadow-none text-blackColor font-xs"
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
      </div>
      <SimpleAreaChart data={chartData} />
    </div>
  );
};

export default ReveneuOverview;
