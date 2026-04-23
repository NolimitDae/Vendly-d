'use client'

import React from "react";
import GenericButton from "../auth/GenericButton";
import { toast } from "sonner";

const SettingActions = () => {
  const handleSaveSettings = () => {
    toast.success("Settings saved successfully");
  };
  return (
    <div className="flex justify-end">
      <GenericButton
        variant="primary"
        rounded="full"
        size="xll"
        className="w-xs"
        onClick={handleSaveSettings}
      >
        Save Platform Settings
      </GenericButton>
    </div>
  );
};

export default SettingActions;
