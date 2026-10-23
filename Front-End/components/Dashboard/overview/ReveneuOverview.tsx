"use client";

import SelectInputField from "@/components/reusable/InputFiled/SelectInputField";
import React, { useEffect, useState } from "react";
import SimpleAreaChart from "./AreaChart";
import { MoneyService } from "@/service/admin/money.service";

interface MonthPoint {
  name: string;
  amount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Twelve monthly totals of Vendly revenue from the revenue report's days. */
export function revenueByMonth(days: { date: string; fees: number; commission: number }[]): MonthPoint[] {
  const totals = new Array(12).fill(0);
  for (const d of days) {
    const m = Number(d.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) totals[m] += Number(d.fees ?? 0) + Number(d.commission ?? 0);
  }
  return MONTHS.map((name, i) => ({ name, amount: Math.round(totals[i] * 100) / 100 }));
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
    // Vendly's own revenue (Protection fees + commission) by month, from the same report as Admin → Revenue
    const y = Number(year);
    MoneyService.revenue(new Date(Date.UTC(y, 0, 1)).toISOString(), new Date(Date.UTC(y + 1, 0, 1)).toISOString())
      .then((res) => {
        const days: { date: string; fees: number; commission: number }[] = res.data?.data?.days ?? [];
        setChartData(revenueByMonth(days));
      })
      .catch(() => setChartData(revenueByMonth([])));
  }, [year]);

  return (
    <div className="bg-grayBg p-4 rounded-xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-blackColor text-lg font-semibold leading-[160%]">Revenue Overview</h3>
          <p className="text-descriptionColor leading-[160%]">Vendly fees + commission by month</p>
        </div>
        <div>
          <SelectInputField
            options={yearOptions}
            placeholder={year}
            className="border-0 shadow-none text-blackColor font-xs"
            onValueChange={(val) => setYear(val)}
          />
        </div>
      </div>
      <SimpleAreaChart data={chartData} />
    </div>
  );
};

export default ReveneuOverview;
