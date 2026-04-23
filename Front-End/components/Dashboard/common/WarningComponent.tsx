import { WarningIcon } from "@/icons";
import React from "react";

const WarningComponent = () => {
  return (
    <div className="flex items-start gap-2.5 bg-warningBg p-3 rounded-xl border-[0.5px] border-warningBorder">
      <div className="pt-1">
        <WarningIcon />
      </div>
      <div className="space-y-1">
        <h3 className="text-[#1D1F2C] text-sm font-medium leading-[160%]">
          11 pending requests require your attention
        </h3>
        <p className="text-grayColor1 text-xs leading-[160%]">
          8 vendor applications and 3 event planner applications are awaiting
          review.
        </p>
      </div>
    </div>
  );
};

export default WarningComponent;
