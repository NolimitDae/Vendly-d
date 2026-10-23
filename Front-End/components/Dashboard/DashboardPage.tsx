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
import { MoneyService } from "@/service/admin/money.service";

const REVENUE_DAYS = 30;

function DashboardPage() {
  const [stats, setStats] = useState({
    vendors: 0,
    eventPlanners: 0,
    bookings: 0,
    revenue: 0,
  });
  const [pending, setPending] = useState({ vendor: 0, ep: 0 });

  useEffect(() => {
    // Vendly's own revenue (Protection fees + commission), as on Admin → Revenue
    const to = new Date();
    const from = new Date(to.getTime() - REVENUE_DAYS * 24 * 3600 * 1000);
    Promise.allSettled([
      AdminService.getVendors({ limit: 1 }),
      AdminService.getEventPlanners({ limit: 1 }),
      AdminService.getBookings({ limit: 1 }),
      MoneyService.revenue(from.toISOString(), to.toISOString()),
      AdminService.getPendingLicense(),
      AdminService.getPendingEventPlanners({ limit: 1 }),
    ]).then(([vendorsRes, epRes, bookingsRes, revenueRes, pendingRes, pendingEpRes]) => {
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
      const revenue =
        revenueRes.status === "fulfilled"
          ? Number(revenueRes.value.data?.data?.totals?.vendly_revenue ?? 0)
          : 0;

      setStats({ vendors, eventPlanners, bookings, revenue });

      if (pendingRes.status === "fulfilled") {
        const list: any[] = Array.isArray(pendingRes.value.data)
          ? pendingRes.value.data
          : (pendingRes.value.data?.data ?? []);
        const vendorCount = list.filter((u: any) => u.type === "VENDOR").length;
        setPending((p) => ({ ...p, vendor: vendorCount }));
      }
      // planners waiting for approval come from their own list (the licence list only holds vendors)
      if (pendingEpRes.status === "fulfilled") {
        const total = Number(pendingEpRes.value.data?.meta?.total ?? pendingEpRes.value.data?.data?.length ?? 0);
        setPending((p) => ({ ...p, ep: total }));
      }
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
      title: "Vendly Revenue",
      value: `$${stats.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      percentage: "",
      icon: <DollarIcon />,
      sub: `Fees + commission, last ${REVENUE_DAYS} days`,
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

        <WarningComponent vendorPending={pending.vendor} epPending={pending.ep} />

        <StatCards statCards={statCards} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] mt-10 gap-5">
        <div className="flex-1">
          <ReveneuOverview />
        </div>
        <div className="flex flex-col space-y-5">
          <TodaysBooking />
          <NewSubscription vendorPending={pending.vendor} epPending={pending.ep} />
        </div>
      </div>

      <div className="mt-5">
        <QuickActions vendorPending={pending.vendor} epPending={pending.ep} />
      </div>
    </div>
  );
}

export default DashboardPage;
