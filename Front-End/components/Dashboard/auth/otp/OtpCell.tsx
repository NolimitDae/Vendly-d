
import { useOtp, type OtpStatus } from "@/hooks/useOtp";
import CustomButton from "@/components/reusable/CustomButton";
import { cn } from "@/lib/utils";
interface OtpCellProps {
  index: number;
  value: string;
  status: OtpStatus;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (value: string, index: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, index: number) => void;
  onFocus: (index: number) => void;
}
export const OtpCell = ({
  index,
  value,
  status,
  inputRef,
  onChange,
  onKeyDown,
  onFocus,
}: OtpCellProps) => {
  const isError = status === "error";
  const isSuccess = status === "success";

  return (
    <input
      ref={inputRef}
      id={`otp-input-${index}`}
      value={value}
      onChange={(e) => onChange(e.target.value, index)}
      onKeyDown={(e) => onKeyDown(e, index)}
      onFocus={() => onFocus(index)}
      maxLength={1}
      type="text"
      inputMode="numeric"
      autoComplete={index === 0 ? "one-time-code" : "off"}
      aria-label={`Digit ${index + 1}`}
      aria-invalid={isError}
      disabled={status === "loading" || status === "success"}
      className={cn(
        // Base
        "w-[3rem] sm:w-[4.375rem] h-[3rem] sm:h-[4.375rem]",
        "bg-grayBg rounded-[1.25rem]",
        "text-center text-2xl text-blackColor font-semibold",
        "outline-none border-2 border-transparent",
        "transition-all duration-150",
        // Focus ring
        "focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(var(--color-primary-rgb),0.12)]",
        // States
        isError && "border-red-400 bg-red-50 text-red-700",
        isSuccess && "border-green-400 bg-green-50 text-green-700",
        // Disabled
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    />
  );
};