import React from "react";
import GenericSelect from "../common/GenericSelectInput";

const SettingPageContent = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
      <GenericSelect
        label="Platform Fee(%)"
        options={[
          { value: "10%", label: "10%" },
          { value: "15%", label: "15%" },
        ]}
        borderRadius="rounded-full"
        height="h-12!"
      />
      <GenericSelect
        label="Default Currency"
        options={[
          { value: "USD", label: "USD" },
          { value: "EUR", label: "EUR" },
        ]}
        borderRadius="rounded-full"
        height="h-12!"
      />
      <GenericSelect
        label="Minimum Booking Amount ($)"
        options={[
          { value: "100", label: "100" },
          { value: "200", label: "200" },
        ]}
        borderRadius="rounded-full"
        height="h-12!"
      />
      <GenericSelect
        label="Maximum Booking Amount ($)"
        options={[
          { value: "1000", label: "1000" },
          { value: "2000", label: "2000" },
        ]}
        borderRadius="rounded-full"
        height="h-12!"
      />
       <GenericSelect
        label="Platform Timezone"
        options={[
          { value: "GMT+0", label: "GMT+0" },
          { value: "GMT+1", label: "GMT+1" },
        ]}
        borderRadius="rounded-full"
        height="h-12!"
      />
    </div>
  );
};

export default SettingPageContent;
