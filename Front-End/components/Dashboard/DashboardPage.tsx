"use client";

import StatCards from "./StateCards";
import DashboardUserTable from "./DashboardUserTable";
import WarningIcon from "@/icons/WarningIcon";
import VendorsIcon from "@/icons/VendorsIcon";
import EventPlannersIcon from "@/icons/EventPlannersIcon";
import MenWithDollarIcon from "@/icons/MenWithDollarIcon";
import DollarIcon from "@/icons/DollarIcon";
import ReveneuOverview from "./overview/ReveneuOverview";
import TodaysBooking from "./todays-booking/TodaysBooking";
import NewSubscription from "./new-subscription/NewSubscription";
import QuickActions from "./quick-actions/QuickActions";
import WarningComponent from "./common/WarningComponent";

function DashboardPage() {
  const statCards = [
    {
      title: "Total Vendors",
      value: 195,
      percentage: "0.1%",
      icon: <VendorsIcon />,
    },
    {
      title: "   Event Planners",
      value: 7,
      percentage: "0.8%",
      icon: <EventPlannersIcon />,
    },
    {
      title: "Total Customers",
      value: 18,
      percentage: "1.5%",
      icon: <MenWithDollarIcon />,
    },
    {
      title: "Total Revenue",
      value: 635,
      percentage: "72.6%",
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

        {/* warning */}
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
