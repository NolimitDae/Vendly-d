import React from "react";
import PrivacyCard from "@/components/Dashboard/privacy/PrivacyCard";
import GenericSelect from "@/components/Dashboard/common/GenericSelectInput";
import PrivacyActions from "@/components/Dashboard/privacy/PrivacyActions";
import { WarningIcon } from "@/icons";
import { MailWarningIcon } from "lucide-react";
import CircleWarning from "@/icons/CircleWarning";

// Nothing on this page is saved anywhere: it only describes how Vendly works. Rows marked
// `accurate: false` describe rules the platform doesn't enforce and are hidden, as is the
// "Max message length" select (PrivacyActions), which saves nothing. Files are kept for later.
//   - cancellations: either side can cancel until the booking is completed; refunds follow the
//     cancellation policy in the signed contract (flexible / moderate / strict), not a 24-hour window
//   - messaging and addresses are not blocked before payment (chat only warns about contact details)
const SHOW_UNSAVED_CONTROLS = false;

const cancellationPolicy = [
  {
    title: "Customer Cancellation",
    description: "24 hours before service when customer can cancel",
    accurate: false,
  },
  {
    title: "Vendor Cancellation",
    description: "Before service started when vendor can cancel",
    accurate: false,
  },
].filter((r) => r.accurate);
const reviewPolicy = [
  {
    title: "Require Booking Completion",
    description: "Only allow reviews after booking is marked complete",
  },
  {
    title: "Allow Vendor Responses",
    description: "Allow vendors to respond to reviews",
  },
];

const communicationRules = [
  {
    title: "No Messaging Before Payment",
    description: "Block direct messaging until payment/deposit is made",
    accurate: false,
  },
  {
    title: "No Address Sharing Before Deposit",
    description: "Prevent sharing addresses until booking is confirmed",
    accurate: false,
  },
  {
    title: "Allow File Sharing",
    description: "Allow customers and vendors to share files",
    accurate: true,
  },
].filter((r) => r.accurate);

const PrivacyPolicyPage = () => {
  return (
    <div className="space-y-5">
      {cancellationPolicy.length > 0 && (
      <div className="pt-5 pb-4 px-4 bg-grayBg rounded-xl">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-[130%] text-blackColor">
            Cancellation Policy
          </h2>
          <p className="text-sm font-normal leading-[160%] text-descriptionColor">
            Configure cancellation windows and refund policies
          </p>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {cancellationPolicy.map((item, index) => (
            <div key={index} className="py-4">
              <PrivacyCard title={item.title} description={item.description} />
            </div>
          ))}
        </div>
      </div>
      )}
      <div className="pt-5 pb-4 px-4 bg-grayBg rounded-xl">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-[130%] text-blackColor">
            Review Policy
          </h2>
          <p className="text-sm font-normal leading-[160%] text-descriptionColor">
            How reviews work on Vendly
          </p>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {reviewPolicy.map((item, index) => (
            <div key={index} className="py-4">
              <PrivacyCard
                key={index}
                title={item.title}
                description={item.description}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="pt-5 pb-4 px-4 bg-grayBg rounded-xl">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-[130%] text-blackColor">
            Communication Rules
          </h2>
          <p className="text-sm font-normal leading-[160%] text-descriptionColor">
            How messaging works on Vendly
          </p>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {communicationRules.map((item, index) => (
            <div key={index} className="py-4">
              <PrivacyCard
                key={index}
                title={item.title}
                description={item.description}
              />
            </div>
          ))}
        </div>
        {SHOW_UNSAVED_CONTROLS && (
        <div>
          <PrivacyActions />
          <div className="flex items-center  gap-1 mt-2">
            <CircleWarning />{" "}
            <p className="text-xs font-normal leading-[160%] text-grayColor1">
              Consecutive failed payments before cancelled
            </p>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
