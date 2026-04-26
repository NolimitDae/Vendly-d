"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CustomTooltip } from "./CustomTollTip";

interface MonthPoint {
  name: string;
  amount: number;
}

const FALLBACK: MonthPoint[] = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
].map((name) => ({ name, amount: 0 }));

const SimpleAreaChart = ({ data }: { data?: MonthPoint[] }) => {
  const chartData = data && data.length > 0 ? data : FALLBACK;
  const maxAmount = Math.max(...chartData.map((d) => d.amount), 1000);
  const step = Math.ceil(maxAmount / 5 / 1000) * 1000 || 1000;
  const ticks = Array.from({ length: 6 }, (_, i) => i * step);

  return (
    <div className="w-full h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#795FF4" stopOpacity={0.9} />
              <stop offset="50%" stopColor="#795FF4" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#795FF4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} />
          <YAxis
            width="auto"
            ticks={ticks}
            tickFormatter={(v) => `$${v.toLocaleString()}`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#795FF4"
            fill="url(#colorRevenue)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SimpleAreaChart;
