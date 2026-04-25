"use client";

import { useEffect, useState } from "react";
import StatCards from "./StateCards";
import VendorsIcon from "@/icons/VendorsIcon";
import EventPlannersIcon from "@/icons/EventPlannersIcon";
import MenWithDollarIcon from "@/icons/MenWithDollarIcon";
import DollarIcon from "@/icons/DollarIcon";
import ReveneuOverview from "./overview/ReveneuOverview";
import TodaysBooking from "./todays-booking/TodaysBooking";
import NewSubscription from "./new-subscription/NewSubscription";
import QuickActions from "./quick-actions/QuickActions";
import WarningComponent from "./common/WarningComponent";
import { AdminService } from "@/service/admin/admin.service";

function DashboardPage() {
  const [stats, setStats] = useState({
    vendors: 0,
    eventPlanners: 0,
    bookings: 0,
    revenue: 0,
  });

  useEffect(() => {
    Promise.allSettled([
      AdminService.getVendors({ limit: 1 }),
      AdminService.getEventPlanners({ limit: 1 }),
      AdminService.getBookings({ limit: 1 }),
      AdminService.getTransactions(),
    ]).then(([vendorsRes, epRes, bookingsRes, txRes]) => {
      const vendors =
        vendorsRes.status === "fulfilled"
          ? (vendorsRes.value.data?.meta?.total ?? 0)
          : 0;
      const eventPlanners =
        epRes.status === "fulfilled"
          ? (epRes.value.data?.meta?.total ?? epRes.value.data?.data?.length ?? 0)
          : 0;
      const bookings =
        bookingsRes.status === "fulfilled"
          ? (bookingsRes.value.data?.meta?.total ?? 0)
          : 0;
      const txData =
        txRes.status === "fulfilled"
          ? (Array.isArray(txRes.value.data) ? txRes.value.data : txRes.value.data?.data ?? [])
          : [];
      const revenue = txData.reduce(
        (sum: number, tx: any) => sum + Number(tx.amount ?? 0),
        0,
      );

      setStats({ vendors, eventPlanners, bookings, revenue });
    });
  }, []);

  const statCards = [
    {
      title: "Total Vendors",
      value: stats.vendors,
      percentage: "",
      icon: <VendorsIcon />,
    },
    {
      title: "Event Planners",
      value: stats.eventPlanners,
      percentage: "",
      icon: <EventPlannersIcon />,
    },
    {
      title: "Total Bookings",
      value: stats.bookings,
      percentage: "",
      icon: <MenWithDollarIcon />,
    },
    {
      title: "Total Revenue",
      value: `$${stats.revenue.toLocaleString()}`,
      percentage: "",
      icon: <DollarIcon />,
    },
  ];

  return (
    <div className="flex flex-col justify-between h-full">
      <div className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-lg md:text-xl font-bold text-blackColor leading-[130%]">
            Dashboard Overview
          </h3>
          <p className="text-sm text-descriptionColor leading-[160%]">
            Monitor your platform performance and manage operations
          </p>
        </div>

        <WarningComponent />

        <StatCards statCards={statCards} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] mt-10 gap-5">
        <div className="flex-1">
          <ReveneuOverview />
        </div>
        <div className="flex flex-col space-y-5">
          <TodaysBooking />
          <NewSubscription />
        </div>
      </div>

      <div className="mt-5">
        <QuickActions />
      </div>
    </div>
  );
}

export default DashboardPage;
