"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import EyeOpenIcon from "@/icons/EyeIcon";
import { EyeOff } from "lucide-react";

type ReusableInputProps = {
  label?: string;
  error?: string;
  containerClassName?: string;
  required?: boolean;
  icon?: React.ReactNode;
  type?: string;
  showPassword?: boolean;
  togglePasswordVisibility?: () => void;
} & React.InputHTMLAttributes<HTMLInputElement>;

const ReusableInput = ({
  label,
  error,
  containerClassName,
  required,
  className,
  icon,
  showPassword,
  togglePasswordVisibility,
  type = "text",
  ...props
}: ReusableInputProps) => {
  return (
    <div className={`space-y-1.5 ${containerClassName || ""}`}>
      
      {/* Label */}
      {label && (
        <Label className="text-sm text-blackColor font-medium">
          {label} {required && <span className="text-redColor">*</span>}
        </Label>
      )}

      {/* Input Wrapper */}
      <div className="relative">

        {/* Left Icon */}
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            {icon}
          </div>
        )}

        {/* Input Field */}
        <Input
          type={type}
          className={`h-12! ${className || ""} ${
            icon ? "pl-10" : ""
          } ${togglePasswordVisibility ? "pr-10" : ""}`}
          {...props}
        />

        {/* Eye Toggle Icon */}
        {togglePasswordVisibility && (
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
            onClick={togglePasswordVisibility}
          >
            {showPassword ? (
              <EyeOpenIcon />
            ) : (
              <EyeOff className="w-4 h-4 text-[#777980]" />
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
};

export default ReusableInput;