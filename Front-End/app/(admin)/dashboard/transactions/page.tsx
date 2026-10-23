import TransactionsPageContent from "@/components/Dashboard/transactions/TransactionsPageContent";
import React from "react";

const TransactionPage = () => {
  // the hard-coded "2 failed payment transactions require review" alert is gone: no endpoint
  // counts failed installments yet, and a made-up number is worse than none
  return <TransactionsPageContent />;
};

export default TransactionPage;
