import React, { forwardRef, memo, useCallback } from "react";
import { TextInputProps } from "../types";
import { InputWrapper } from "./InputWrapper";
import { useInputId, usePasswordToggle } from "@/hooks";
import { Spinner, EyeIcon, EyeOffIcon, XIcon } from "@/icons";
import {
  sizeConfig,
  buildInputClass,
} from "@/components/Dashboard/Input/utils/variants";
import { cn } from "@/lib/utils";

// ─── BaseInput ────────────────────────────────────────────────────────────────

export const BaseInput = forwardRef<HTMLInputElement, TextInputProps>(
  function BaseInput(
    {
      id: providedId,
      name,
      type = "text",
      size = "md",
      variant = "outlined",
      fullWidth = false,
      label,
      wrapperClassName,
      labelClassName,
      errorClassName,
      helperClassName,
      error,
      helperText,
      successText,
      required,
      prefix,
      suffix,
      prefixClassName,
      suffixClassName,
      loading = false,
      clearable = false,
      passwordToggle: passwordToggleProp,
      disabled = false,
      readOnly = false,
      value,
      defaultValue,
      onChange,
      inputClassName,
      className,
      placeholder,
      ...rest
    },
    ref,
  ) {
    const id = useInputId(providedId);
    const isPassword = type === "password";
    const showPasswordToggle = passwordToggleProp ?? isPassword;
    const { visible, toggle, inputType } = usePasswordToggle();

    const resolvedType = isPassword ? inputType : type;
    const hasError =
      !!error && (Array.isArray(error) ? error.length > 0 : true);
    const hasSuccess = !hasError && !!successText;

    const s = sizeConfig[size];

    const hasValue =
      value !== undefined
        ? String(value).length > 0
        : defaultValue !== undefined
          ? String(defaultValue).length > 0
          : false;

    const handleClear = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        const nativeInput = (ref as React.RefObject<HTMLInputElement>)?.current;
        if (nativeInput) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          nativeInputValueSetter?.call(nativeInput, "");
          nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
      [ref],
    );

    const resolvedSuffix = loading ? (
      <Spinner className={cn(s.icon, "text-slate-400")} />
    ) : showPasswordToggle && isPassword ? (
      <button
        type="button"
        tabIndex={-1}
        onClick={toggle}
        aria-label={visible ? "Hide password" : "Show password"}
        className={cn(
          "flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ",
          s.icon,
        )}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    ) : clearable && hasValue ? (
      <button
        type="button"
        tabIndex={-1}
        onClick={handleClear}
        aria-label="Clear input"
        className={cn(
          "flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-full cursor-pointer",
          s.icon,
        )}
      >
        <XIcon />
      </button>
    ) : (
      suffix
    );

    const hasSuffix = !!resolvedSuffix;
    const hasPrefix = !!prefix;

    const inputClass = buildInputClass({
      size,
      variant,
      hasError,
      hasSuccess,
      disabled,
      hasPrefix,
      hasSuffix,
      fullWidth,
      extra: inputClassName ?? className,
    });

    return (
      <InputWrapper
        id={id}
        label={label}
        error={error}
        helperText={helperText}
        successText={successText}
        required={required}
        fullWidth={fullWidth}
        wrapperClassName={wrapperClassName}
        labelClassName={labelClassName}
        errorClassName={errorClassName}
        helperClassName={helperClassName}
        size={size}
        disabled={disabled}
      >
        <div className="relative flex items-center">
          {hasPrefix && (
            <span
              className={cn(
                "absolute left-0 flex items-center justify-center text-slate-400 dark:text-slate-500 pointer-events-none ",
                s.icon,
                "ml-3",
                prefixClassName,
              )}
            >
              {prefix}
            </span>
          )}

          {/* Input element */}
          <input
            ref={ref}
            id={id}
            name={name}
            type={resolvedType}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            placeholder={placeholder}
            aria-invalid={hasError ? "true" : undefined}
            aria-describedby={
              hasError ? `${id}-error` : helperText ? `${id}-helper` : undefined
            }
            className={inputClass}
            {...rest}
          />

          {/* Suffix */}
          {hasSuffix && (
            <span
              className={cn(
                "absolute right-0 flex items-center justify-center text-slate-400 dark:text-slate-500",
                s.icon,
                "mr-3",
                suffixClassName,
              )}
            >
              {resolvedSuffix}
            </span>
          )}
        </div>
      </InputWrapper>
    );
  },
);
