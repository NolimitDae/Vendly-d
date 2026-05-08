"use client";

import React, { useEffect, useState } from "react";
import GenericSelect from "../common/GenericSelectInput";
import GenericButton from "../auth/GenericButton";
import { AdminService } from "@/service/admin/admin.service";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";

const FEE_OPTIONS = ["5", "10", "15", "20"].map((v) => ({ value: v, label: `${v}%` }));
const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "AED"].map((v) => ({ value: v, label: v }));
const MIN_OPTIONS = ["50", "100", "200", "500"].map((v) => ({ value: v, label: `$${v}` }));
const MAX_OPTIONS = ["500", "1000", "2000", "5000"].map((v) => ({ value: v, label: `$${v}` }));
const TZ_OPTIONS = ["GMT-5", "GMT+0", "GMT+1", "GMT+3", "GMT+5", "GMT+8"].map((v) => ({ value: v, label: v }));

const DEFAULTS = {
  platformFee: "10",
  currency: "USD",
  minBookingAmount: "100",
  maxBookingAmount: "1000",
  timezone: "GMT+0",
};

const SettingPageContent = () => {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AdminService.getSettings()
      .then((res) => {
        if (res.data?.success) setSettings({ ...DEFAULTS, ...res.data.data });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof typeof DEFAULTS) => (value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await AdminService.updateSettings(settings);
      if (res.data?.success) {
        toast.success("Settings saved successfully");
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
        <GenericSelect
          label="Platform Fee (%)"
          options={FEE_OPTIONS}
          value={settings.platformFee}
          onValueChange={set("platformFee")}
          borderRadius="rounded-full"
          height="h-12!"
        />
        <GenericSelect
          label="Default Currency"
          options={CURRENCY_OPTIONS}
          value={settings.currency}
          onValueChange={set("currency")}
          borderRadius="rounded-full"
          height="h-12!"
        />
        <GenericSelect
          label="Minimum Booking Amount ($)"
          options={MIN_OPTIONS}
          value={settings.minBookingAmount}
          onValueChange={set("minBookingAmount")}
          borderRadius="rounded-full"
          height="h-12!"
        />
        <GenericSelect
          label="Maximum Booking Amount ($)"
          options={MAX_OPTIONS}
          value={settings.maxBookingAmount}
          onValueChange={set("maxBookingAmount")}
          borderRadius="rounded-full"
          height="h-12!"
        />
        <GenericSelect
          label="Platform Timezone"
          options={TZ_OPTIONS}
          value={settings.timezone}
          onValueChange={set("timezone")}
          borderRadius="rounded-full"
          height="h-12!"
        />
      </div>
      <div className="flex justify-end">
        <GenericButton
          variant="primary"
          rounded="full"
          size="xll"
          className="w-xs"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Platform Settings"}
        </GenericButton>
      </div>
    </div>
  );
};

export default SettingPageContent;
