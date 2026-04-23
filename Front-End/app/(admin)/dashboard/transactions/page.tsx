

import DataFilterBar from "@/components/Dashboard/common/DataFilterBar";
import TransactionsPageContent from "@/components/Dashboard/transactions/TransactionsPageContent";
import { WarningIcon } from "@/icons";
import React from "react";

const TransactionPage = () => {
  return (
    <>
      <div className="flex items-start gap-2.5 bg-warningBg border-[0.5px] border-warningBorder p-3 rounded-xl">
        <div className="mt-1">
          <WarningIcon />
        </div>
        <div>
          <h2 className="text-grayColor2 leading-[160%] text-sm font-medium">
            Attention Required
          </h2>
          <p className="text-grayColor1 leading-[160%] text-xs font-normal">
            2 failed payment transactions require review.
          </p>
        </div>
      </div>

     
      <TransactionsPageContent />
    </>
  );
};

export default TransactionPage;
