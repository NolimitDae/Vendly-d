"use client";

import React from "react";
import QuickActionsCard from "./QuickActionsCard";
import VendorsIcon from "@/icons/VendorsIcon";
import EventPlannersIcon from "@/icons/EventPlannersIcon";

interface Props {
  vendorPending?: number;
  epPending?: number;
}

const QuickActions = ({ vendorPending = 0, epPending = 0 }: Props) => {
  const quickActions = [
    {
      title: "Review Vendor Requests",
      description: `${vendorPending} vendor application${vendorPending !== 1 ? "s" : ""} pending`,
      icon: <VendorsIcon />,
      href: "/dashboard/vendors/pending-requests",
    },
    {
      title: "Review Planner Requests",
      description: `${epPending} event planner application${epPending !== 1 ? "s" : ""} pending`,
      icon: <EventPlannersIcon />,
      href: "/dashboard/event-planners/pending-requests",
    },
    {
      title: "Failed Transactions",
      description: "Requires immediate attention",
      icon: <EventPlannersIcon />,
      href: "/dashboard/transactions",
    },
    {
      title: "System Alerts",
      description: "Important platform notifications",
      icon: <VendorsIcon />,
      href: "/dashboard",
    },
  ];

  return (
    <div className="bg-grayBg p-4 rounded-2xl space-y-3">
      <h3 className="text-lg font-semibold text-blackColor leading-[160%]">Quick Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        {quickActions.map((action, index) => (
          <QuickActionsCard key={index} action={action} />
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
