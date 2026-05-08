import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type OtpStatus = "idle" | "loading" | "success" | "error";

interface UseOtpOptions {
  length?: number;
  onComplete?: (otp: string) => Promise<void> | void;
}

interface UseOtpReturn {
  otp: string[];
  status: OtpStatus;
  errorMessage: string | null;
  inputsRef: React.MutableRefObject<(HTMLInputElement | null)[]>;
  isComplete: boolean;
  handleChange: (value: string, index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, index: number) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  handleFocus: (index: number) => void;
  handleSubmit: () => Promise<void>;
  reset: () => void;
}

export function useOtp({
  length = 6,
  onComplete,
}: UseOtpOptions = {}): UseOtpReturn {
  const [otp, setOtp] = useState<string[]>(Array(length).fill(""));
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
const router = useRouter();
  const isComplete = otp.every((d) => d !== "");

  const focusIndex = useCallback((index: number) => {
    inputsRef.current[index]?.focus();
  }, []);

  const handleChange = useCallback(
    (value: string, index: number) => {
      // Accept only single digit
      if (!/^\d?$/.test(value)) return;

      setOtp((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });

      setErrorMessage(null);

      if (value && index < length - 1) {
        focusIndex(index + 1);
      }
    },
    [length, focusIndex]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      switch (e.key) {
        case "Backspace":
          if (!otp[index] && index > 0) {
            focusIndex(index - 1);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (index > 0) focusIndex(index - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (index < length - 1) focusIndex(index + 1);
          break;
        default:
          break;
      }
    },
    [otp, length, focusIndex]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").trim().slice(0, length);
      if (!/^\d+$/.test(pasted)) return;

      const digits = pasted.split("");
      setOtp([...digits, ...Array(length - digits.length).fill("")]);
      setErrorMessage(null);

      // Focus last filled or next empty
      const nextIndex = Math.min(digits.length, length - 1);
      focusIndex(nextIndex);
    },
    [length, focusIndex]
  );

  const handleFocus = useCallback((index: number) => {
    // Select existing digit on focus for easy replacement
    inputsRef.current[index]?.select();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isComplete) {
      setErrorMessage("Please enter all digits.");
      focusIndex(otp.findIndex((d) => d === ""));
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      await onComplete?.(otp.join(""));
      setStatus("success");
      if (!onComplete) {
        router.push("/dashboard");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verification failed. Try again.";
      setErrorMessage(message);
      setStatus("error");
    }
  }, [isComplete, otp, onComplete, focusIndex]);

  const reset = useCallback(() => {
    setOtp(Array(length).fill(""));
    setStatus("idle");
    setErrorMessage(null);
    focusIndex(0);
  }, [length, focusIndex]);

  return {
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
    reset,
  };
}