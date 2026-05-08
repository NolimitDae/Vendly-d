"use client";

import { WarningIcon } from "@/icons";
import React from "react";

interface Props {
  vendorPending?: number;
  epPending?: number;
}

const WarningComponent = ({ vendorPending = 0, epPending = 0 }: Props) => {
  const total = vendorPending + epPending;
  if (total === 0) return null;

  return (
    <div className="flex items-start gap-2.5 bg-warningBg p-3 rounded-xl border-[0.5px] border-warningBorder">
      <div className="pt-1">
        <WarningIcon />
      </div>
      <div className="space-y-1">
        <h3 className="text-[#1D1F2C] text-sm font-medium leading-[160%]">
          {total} pending request{total !== 1 ? "s" : ""} require your attention
        </h3>
        <p className="text-grayColor1 text-xs leading-[160%]">
          {vendorPending > 0 && `${vendorPending} vendor application${vendorPending !== 1 ? "s" : ""}`}
          {vendorPending > 0 && epPending > 0 && " and "}
          {epPending > 0 && `${epPending} event planner application${epPending !== 1 ? "s" : ""}`}
          {" "}
          {total === 1 ? "is" : "are"} awaiting review.
        </p>
      </div>
    </div>
  );
};

export default WarningComponent;
