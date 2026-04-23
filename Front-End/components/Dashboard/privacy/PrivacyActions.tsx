"use client";

import React from "react";
import GenericSelect from "../common/GenericSelectInput";

const cancellationPolicy = [
  {
    label: "Customer Cancellation",
    value: "Customer Cancellation",
  },
  {
    label: "Vendor Cancellation",
    value: "Vendor Cancellation",
  },
];

const PrivacyActions = () => {
  return (
    <GenericSelect
      label="Max message length (characters)"
      options={cancellationPolicy}
      className="max-w-md rounded-2xl"
      
    />
  );
};

export default PrivacyActions;
