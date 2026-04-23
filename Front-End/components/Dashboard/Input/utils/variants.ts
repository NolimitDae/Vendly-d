import { InputSize, InputVariant } from "@/components/Dashboard/Input/types";

// ─── Utility: clsx-like class merger ─────────────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Size Tokens 

export const sizeConfig: Record<
  InputSize,
  {
    input: string;
    label: string;
    helper: string;
    icon: string;
    iconPad: string;
    radius: string;
  }
> = {
  sm: {
    input: "h-8 px-3 text-xs",
    label: "text-xs font-medium mb-0.5",
    helper: "text-[11px] mt-0.5",
    icon: "w-3.5 h-3.5",
    iconPad: "px-2",
    radius: "rounded",
  },
  md: {
    input: "h-10 px-3.5 text-sm",
    label: "text-sm font-medium mb-1",
    helper: "text-xs mt-1",
    icon: "w-4 h-4",
    iconPad: "px-3",
    radius: "rounded-md",
  },
  full: {
    input: "h-12 px-4 text-base",
    label: "text-sm font-semibold mb-1.5",
    helper: "text-sm mt-1.5",
    icon: "w-5 h-5",
    iconPad: "px-3.5",
    radius: "rounded-full",
  },
};

// ─── Variant Tokens 

export const variantConfig: Record<
  InputVariant,
  {
    base: string;
    focus: string;
    error: string;
    success: string;
    disabled: string;
  }
> = {
  outlined: {
    base: "border border-borderColor",
    focus:
      "focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:focus:border-violet-400",
    error:
      "border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500",
    success:
      "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20",
    disabled:
      "bg-slate-50 border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:border-slate-700",
  },
  filled: {
    base: "border border-transparent bg-slate-100 dark:bg-slate-800 dark:border-transparent",
    focus:
      "focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:focus:bg-slate-900 dark:focus:border-violet-400",
    error:
      "bg-red-50 border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:bg-red-900/20 dark:border-red-500",
    success:
      "bg-emerald-50 border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20",
    disabled: "bg-slate-100 cursor-not-allowed opacity-60 dark:bg-slate-800",
  },
  ghost: {
    base: "border-b border-slate-300 bg-transparent rounded-none px-0 dark:border-slate-600",
    focus: "focus:border-violet-500 focus:ring-0 dark:focus:border-violet-400",
    error: "border-red-400 focus:border-red-500 dark:border-red-500",
    success: "border-emerald-400 focus:border-emerald-500",
    disabled:
      "border-slate-200 cursor-not-allowed opacity-60 dark:border-slate-700",
  },
};

//  Compose input className 

interface BuildInputClassOptions {
  size: InputSize;
  variant: InputVariant;
  hasError: boolean;
  hasSuccess: boolean;
  disabled: boolean;
  hasPrefix: boolean;
  hasSuffix: boolean;
  fullWidth: boolean;
  extra?: string;
}

export function buildInputClass({
  size,
  variant,
  hasError,
  hasSuccess,
  disabled,
  hasPrefix,
  hasSuffix,
  fullWidth,
  extra,
}: BuildInputClassOptions): string {
  const s = sizeConfig[size];
  const v = variantConfig[variant];

  const stateClass = disabled
    ? v.disabled
    : hasError
      ? `${v.base} ${v.error}`
      : hasSuccess
        ? `${v.base} ${v.success}`
        : `${v.base} ${v.focus}`;

  // Adjust horizontal padding when prefix/suffix present
  const prefixPad = hasPrefix && variant !== "ghost" ? "pl-9" : "";
  const suffixPad = hasSuffix && variant !== "ghost" ? "pr-9" : "";

  return cn(
    "w-full outline-none transition-all duration-150",
    "text-slate-900 dark:text-slate-100",
    "placeholder:text-progressBarBg dark:placeholder:text-slate-500",
    "disabled:opacity-60",
    s.input,
    s.radius,
    stateClass,
    prefixPad,
    suffixPad,
    fullWidth ? "block" : "inline-block",
    extra,
  );
}

// ─── Label class builder ──────────────────────────────────────────────────────

export function buildLabelClass(
  size: InputSize,
  disabled: boolean,
  extra?: string,
): string {
  return cn(
    "block select-none",
    sizeConfig[size].label,
    disabled && "opacity-50",
    extra,
  );
}
