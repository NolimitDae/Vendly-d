"use client";

import ReusableInput from "@/components/reusable/InputFiled/ReusableInput";
import LockIcon from "@/icons/LockIcon";
import React, { useState } from "react";
import { GenericButton } from "../GenericButton";
import CircleTickIcon from "@/icons/CircleTickIcon";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthService } from "@/service/auth/auth.service";
import { toast } from "react-toastify";

const ChangePassForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);

  const strengthCount = [hasMinLength, hasNumber, hasUppercase, hasSpecial].filter(Boolean).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strengthCount];

  const handleSubmit = async () => {
    if (!password || password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!hasMinLength) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await AuthService.resetPassword({ email, token, password });
      if (res.data?.success) {
        toast.success("Password updated successfully!");
        router.push("/confirmationPass");
      } else {
        toast.error(res.data?.message || "Failed to reset password");
      }
    } catch {
      toast.error("Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
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
          togglePasswordVisibility={() => setShowPassword((p) => !p)}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {/* password strength indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`w-1/4 h-1 rounded-lg transition-colors ${
                strengthCount >= level ? "gradient-bg" : "bg-gray-200 dark:bg-gray-600"
              }`}
            />
          ))}
          {strengthLabel && (
            <span className="text-xs leading-[160%] font-medium bg-linear-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent">
              {strengthLabel}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-y-3">
          <div className="flex items-center gap-2">
            <CircleTickIcon color={hasMinLength ? "#795FF4" : undefined} />
            <p className="text-xs leading-[160%] font-medium text-grayColor1">8 characters minimum</p>
          </div>
          <div className="flex items-center gap-2">
            <CircleTickIcon color={hasNumber ? "#795FF4" : undefined} />
            <p className="text-xs leading-[160%] font-medium text-grayColor1">numbers (0-9)</p>
          </div>
          <div className="flex items-center gap-2">
            <CircleTickIcon color={hasUppercase ? "#795FF4" : undefined} />
            <p className="text-xs leading-[160%] font-medium text-grayColor1">uppercase letters (A-Z)</p>
          </div>
          <div className="flex items-center gap-2">
            <CircleTickIcon color={hasSpecial ? "#795FF4" : undefined} />
            <p className="text-xs leading-[160%] font-medium text-grayColor1">special characters (!@#$%^&*)</p>
          </div>
        </div>

        <ReusableInput
          label="Confirm new Password"
          type={showConfirmPassword ? "text" : "password"}
          icon={<LockIcon />}
          className="rounded-2xl"
          placeholder="Re enter your new password"
          showPassword={showConfirmPassword}
          togglePasswordVisibility={() => setShowConfirmPassword((p) => !p)}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      <div className="space-y-5">
        <GenericButton
          variant="primary"
          size="md"
          rounded="2xl"
          onClick={handleSubmit}
          disabled={loading}
          fullWidth
          height="lg"
        >
          {loading ? "Saving…" : "Set Password"}
        </GenericButton>

        <GenericButton
          variant="outline"
          size="md"
          rounded="2xl"
          onClick={() => router.push("/login")}
          fullWidth
          height="lg"
        >
          Back to sign in
        </GenericButton>
      </div>
    </div>
  );
};

export default ChangePassForm;
