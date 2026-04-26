import WarningComponent from "@/components/Dashboard/common/WarningComponent";
import SettingPageContent from "@/components/Dashboard/setting/SettingPageContent";
import React from "react";

const SettingsPage = () => {
  return (
    <div>
      <WarningComponent />
      <div className="bg-grayBg p-4 gap-5 rounded-xl mt-5 mb-6">
        <div className="space-y-1 mb-9">
          <h2 className="text-blackColor text-lg font-semibold leading-[130%]">
            Platform Configuration
          </h2>
          <p className="text-descriptionColor text-sm leading-[160%]">
            General platform settings including fees and limits
          </p>
        </div>
        <SettingPageContent />
      </div>
    </div>
  );
};

export default SettingsPage;
