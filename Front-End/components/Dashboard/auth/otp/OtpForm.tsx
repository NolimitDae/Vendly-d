"use client";

import { useOtp } from "@/hooks/useOtp";
import CustomButton from "@/components/reusable/CustomButton";
import { cn } from "@/lib/utils";
import GenericButton from "../GenericButton";
import { OtpCell } from "./OtpCell";
import { StatusIcon } from "./StatusIcon";

interface OtpFormProps {
  length?: number;
  onComplete?: (otp: string) => Promise<void> | void;
  label?: string;
  hint?: string;
}

const OtpForm = ({
  length = 6,
  onComplete,
  label = "Enter verification code",
  hint,
}: OtpFormProps) => {
  const {
    otp,
    status,
    errorMessage,
    inputsRef,
    isComplete,
    handleChange,
    handleKeyDown,
    handlePaste,
    handleFocus,
    handleSubmit,
  } = useOtp({ length, onComplete });

  const formId = "otp-form";

  return (
    <div className="space-y-6">
      {/* Label + hint */}
      <div className="space-y-1">
        {hint && (
          <p id={`${formId}-hint`} className="text-sm text-gray-500">
            {hint}
          </p>
        )}
      </div>

      {/* OTP digit row */}
      <div
        role="group"
        aria-labelledby={`${formId}-label`}
        aria-describedby={
          hint ? `${formId}-hint` : errorMessage ? `${formId}-error` : undefined
        }
        className="flex justify-between items-center gap-2"
        onPaste={handlePaste}
      >
        {otp.map((digit, index) => (
          <OtpCell
            key={index}
            index={index}
            value={digit}
            status={status}
            inputRef={(el) => {
              inputsRef.current[index] = el;
            }}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
          />
        ))}
      </div>

      {/* Inline error */}
      {errorMessage && (
        <p
          id={`${formId}-error`}
          role="alert"
          aria-live="polite"
          className="text-sm text-red-600 flex items-center gap-1.5"
        >
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          {errorMessage}
        </p>
      )}

      {/* Success banner */}
      {status === "success" && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-green-600 flex items-center gap-1.5"
        >
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
          Verified successfully!
        </p>
      )}

      {/* Submit */}
      <GenericButton
        variant="primary"
        size="md"
        fullWidth
        rounded="2xl"
        height="lg"
        onClick={handleSubmit}
        disabled={!isComplete || status === "loading" || status === "success"}
        aria-disabled={!isComplete || status === "loading"}
      >
        {" "}
        {/* <StatusIcon status={status} /> */}
        {status === "loading"
          ? "Verifying…"
          : status === "success"
            ? "Verified"
            : "Submit"}
      </GenericButton>
    </div>
  );
};

export default OtpForm;
