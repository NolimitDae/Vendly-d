"use client";

import React from "react";
import { cn } from "@/lib/utils"; // or replace with your own cn()

interface ToggleSwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: {
    track: "w-9 h-5",
    thumb: "w-4 h-4",
    translate: "translate-x-4",
  },
  md: {
    track: "w-11 h-6",
    thumb: "w-5 h-5",
    translate: "translate-x-5",
  },
  lg: {
    track: "w-14 h-7",
    thumb: "w-6 h-6",
    translate: "translate-x-7",
  },
};

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  defaultChecked = true,
  onChange,
  disabled = false,
  label,
  size = "md",
  className,
}) => {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isOn = isControlled ? checked : internal;

  const handleToggle = () => {
    if (disabled) return;

    if (!isControlled) setInternal(!internal);
    onChange?.(!isOn);
  };

  const styles = sizeStyles[size];

  return (
    <label
      className={cn(
        "inline-flex items-center gap-3 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {/* Hidden input for accessibility */}
      <input
        type="checkbox"
        checked={isOn}
        onChange={handleToggle}
        disabled={disabled}
        className="sr-only"
      />

      {/* Track */}
      <div
        className={cn(
          "relative rounded-full transition-colors duration-300",
          styles.track,
          isOn ? "bg-purpleOne" : "bg-gray-200 dark:bg-gray-700",
        )}
      >
        {/* Thumb */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 left-0.5 bg-white rounded-full shadow-md transition-all duration-300",
            styles.thumb,
            isOn && styles.translate,
          )}
        />
      </div>

      {/* Label */}
      {label && <span className="text-sm text-blackColor">{label}</span>}
    </label>
  );
};

export default ToggleSwitch;
