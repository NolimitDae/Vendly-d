"use client";

import VendorsIcon from "@/icons/VendorsIcon";
import EventPlannersIcon from "@/icons/EventPlannersIcon";
import React from "react";
import GenericButton from "../auth/GenericButton";
import Link from "next/link";

interface Props {
  vendorPending?: number;
  epPending?: number;
}

const NewSubscription = ({ vendorPending = 0, epPending = 0 }: Props) => {
  return (
    <div className="p-4 bg-grayBg rounded-xl">
      <h3 className="text-lg font-bold text-blackColor leading-[130%]">
        New Subscription
      </h3>

      <div className="flex flex-col divide-y divide-borderColor mt-4">
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-1.5">
            <div className="h-[1.938rem] w-[1.938rem] rounded-full bg-white flex items-center justify-center border-[0.5px] border-borderColor">
              <VendorsIcon />
            </div>
            <div>
              <h2 className="text-sm text-blackColor font-medium leading-[160%]">Vendor</h2>
              <span className="text-grayColor1 text-xs leading-[160%]">
                {vendorPending} pending
              </span>
            </div>
          </div>
          <Link href="/dashboard/vendors/pending-requests">
            <GenericButton size="xsm" variant="primary" rounded="xl">Review</GenericButton>
          </Link>
        </div>
        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-1.5">
            <div className="h-[1.938rem] w-[1.938rem] rounded-full bg-white flex items-center justify-center border-[0.5px] border-borderColor">
              <EventPlannersIcon />
            </div>
            <div>
              <h2 className="text-sm text-blackColor font-medium leading-[160%]">Event Planner</h2>
              <span className="text-grayColor1 text-xs leading-[160%]">
                {epPending} pending
              </span>
            </div>
          </div>
          <Link href="/dashboard/event-planners/pending-requests">
            <GenericButton size="xsm" variant="outline" rounded="xl">Review</GenericButton>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NewSubscription;
