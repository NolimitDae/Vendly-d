"use client";

import { useEffect, useState } from "react";
import BookingRow from "./BookingRow";
import CalenderBlack from "@/icons/CalenderBlack";
import PendingApprovalIcon from "@/icons/PendingApprovalIcon";
import FailedIcon from "@/icons/FailedIcon";
import { AdminService } from "@/service/admin/admin.service";

const TodaysBooking = () => {
  const [stats, setStats] = useState({ total: 0, pending: 0, cancelled: 0 });

  useEffect(() => {
    Promise.allSettled([
      AdminService.getBookings({ limit: 1 }),
      AdminService.getBookings({ limit: 1, status: "PENDING" }),
      AdminService.getBookings({ limit: 1, status: "CANCELLED" }),
    ]).then(([totalRes, pendingRes, cancelledRes]) => {
      setStats({
        total:
          totalRes.status === "fulfilled"
            ? (totalRes.value.data?.meta?.total ?? 0)
            : 0,
        pending:
          pendingRes.status === "fulfilled"
            ? (pendingRes.value.data?.meta?.total ?? 0)
            : 0,
        cancelled:
          cancelledRes.status === "fulfilled"
            ? (cancelledRes.value.data?.meta?.total ?? 0)
            : 0,
      });
    });
  }, []);

  const bookingData = [
    { label: "Total Bookings", value: stats.total, icon: <CalenderBlack /> },
    { label: "Pending Approval", value: stats.pending, icon: <PendingApprovalIcon /> },
    { label: "Cancelled", value: stats.cancelled, icon: <FailedIcon /> },
  ];

  return (
    <div className="p-4 bg-grayBg rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-blackColor leading-[130%]">Bookings</h3>
      </div>
      <div className="divide-y divide-borderColor">
        {bookingData.map((item, index) => (
          <div key={index} className="py-4">
            <BookingRow label={item.label} value={item.value} icon={item.icon} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TodaysBooking;
