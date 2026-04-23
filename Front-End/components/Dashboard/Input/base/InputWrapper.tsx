import React, { memo } from "react";
import { InputWrapperProps } from "../types";
import { cn, sizeConfig, buildLabelClass } from "../utils/variants";
import { ErrorIcon, SuccessIcon } from "@/icons";


export const InputWrapper = memo<InputWrapperProps>(function InputWrapper({
  id,
  label,
  error,
  helperText,
  successText,
  required,
  fullWidth,
  wrapperClassName,
  labelClassName,
  errorClassName,
  helperClassName,
  size = "md",
  children,
  disabled,
}) {
  const errorMessages = Array.isArray(error) ? error : error ? [error] : [];
  const hasError = errorMessages.length > 0;
  const s = sizeConfig[size];

  return (
    <div
      className={cn(
        "flex flex-col",
        fullWidth ? "w-full" : "w-fit",
        wrapperClassName,
      )}
    >
      {/* Label */}
      {label && (
        <label
          htmlFor={id}
          className={buildLabelClass(size, !!disabled, labelClassName)}
        >
          {label}
          {required && (
            <span className="ml-1 text-red-500 select-none" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {/* Input slot */}
      {children}

      {/* Error messages */}
      {hasError && (
        <div
          role="alert"
          aria-live="polite"
          className={cn("flex flex-col gap-0.5", s.helper)}
        >
          {errorMessages.map((msg, i) => (
            <span
              key={i}
              className={cn(
                "flex items-center gap-1 text-red-500 dark:text-red-400",
                errorClassName,
              )}
            >
              <ErrorIcon />
              {msg}
            </span>
          ))}
        </div>
      )}

      {/* Success text */}
      {!hasError && successText && (
        <span
          className={cn(
            "flex items-center gap-1 text-emerald-600 dark:text-emerald-400",
            s.helper,
            helperClassName,
          )}
        >
          <SuccessIcon />
          {successText}
        </span>
      )}

      {/* Helper text */}
      {!hasError && !successText && helperText && (
        <span
          className={cn(
            "text-slate-500 dark:text-slate-400",
            s.helper,
            helperClassName,
          )}
        >
          {helperText}
        </span>
      )}
    </div>
  );
});
