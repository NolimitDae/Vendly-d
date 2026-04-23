"use client";

import CustomButton from "@/components/reusable/CustomButton";
import ReusableInput from "@/components/reusable/InputFiled/ReusableInput";
import EmailIcon from "@/icons/EmailIcon";
import LockIcon from "@/icons/LockIcon";
import React from "react";
import { GenericButton } from "../GenericButton";
import CircleTickIcon from "@/icons/CircleTickIcon";
import { useRouter } from "next/navigation";

const ChangePassForm = () => {
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
const router = useRouter();
  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };
  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword((prev) => !prev);
  };
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <ReusableInput
          label="New Password"
          type={showPassword ? "text" : "password"}
          icon={<LockIcon />}
          className="rounded-2xl"
          placeholder="•••••••••"
          showPassword={showPassword}
          togglePasswordVisibility={togglePasswordVisibility}
        />
        {/* password strength checker */}
        <div className="flex items-center gap-2">
          <div className="w-1/4 h-1 rounded-lg gradient-bg" />
          <div className="w-1/4 h-1 rounded-lg gradient-bg" />
          <div className="w-1/4 h-1 rounded-lg gradient-bg" />
          <div className="w-1/4 h-1 rounded-lg gradient-bg" />
          <span className="text-xs leading-[160%] font-medium bg-linear-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent">
            Good
          </span>
        </div>

        <div className="grid grid-cols-2 gap-y-3">
          <div className="flex items-center gap-2">
            <CircleTickIcon color="#795FF4" /> <p className="text-xs leading-[160%] font-medium text-grayColor1">8 characters minimum</p>
          </div>
          <div className="flex items-center gap-2">
            <CircleTickIcon color="#795FF4" /> <p className="text-xs leading-[160%] font-medium text-grayColor1">numbers (0-9)</p>
          </div>
          <div className="flex items-center gap-2">
            <CircleTickIcon color="#795FF4" /> <p className="text-xs leading-[160%] font-medium text-grayColor1">uppercase letters (A-Z)</p>
          </div>
          <div className="flex items-center gap-2">
            <CircleTickIcon /> <p className="text-xs leading-[160%] font-medium text-grayColor1">special characters (!@#$%^&*)</p>
          </div>
        </div>
        <ReusableInput
          label="Confirm new Password"
          type={showConfirmPassword ? "text" : "password"}
          icon={<LockIcon />}
          className="rounded-2xl"
          placeholder="Re enter your new password"
          showPassword={showConfirmPassword}
          togglePasswordVisibility={toggleConfirmPasswordVisibility}
        />
      </div>

      <div className="space-y-5">
        <GenericButton
          variant="primary"
          size="md"
          rounded="2xl"
          onClick={() => router.push("/dashboard")}
          fullWidth
          height="lg"
        >
          Set Password
        </GenericButton>

        <GenericButton
          variant="outline"
          size="md"
          rounded="2xl"
          onClick={() => console.log("Saved")}
          fullWidth
          height="lg"
        >
          Back to sign in
        </GenericButton>
      </div>

      {/* Social Login */}
    </div>
  );
};

export default ChangePassForm;
