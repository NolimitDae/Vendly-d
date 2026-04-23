import React from "react";

type Variant = "primary" | "outline" |"plain";
type Size = "xsm" | "sm" | "md" | "xl" | "lg" | "xll" | "xlg";
type Rounded = "full" | "lg" | "xl" | "2xl";
type IconPosition = "left" | "right";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  rounded?: Rounded;
  height?: string;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
  children: React.ReactNode;
}

// ─── Style Maps ──────────────────────────────────────────────────────────────

const variantStyles: Record<Variant, string> = {
  primary: [
    "gradient-bg text-white border border-transparent font-medium","disabled:cursor-not-allowed"
  ].join(" "),

  outline: [
    "border border-purpleOne bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent font-semibold",
    "disabled:border-indigo-200 disabled:text-indigo-300 disabled:cursor-not-allowed",
  ].join(" "),
  plain: [
    " bg-white font-semibold text-descriptionColor cursor-pointer",
    " disabled:cursor-not-allowed",
  ].join(" "),
};

const sizeStyles: Record<Size, string> = {
  xsm: "px-4 py-[0.313rem] text-sm gap-1",
  sm: "px-3 py-1.5 text-sm gap-1.5",
  xll: "px-6 py-3 text-xs gap-2.5",
  md: "px-3 py-2 text-sm gap-2",
  xl: "px-2 py-[0.625rem] text-xs gap-2.5",
  lg: "px-6 py-3 text-lg gap-2.5",
  xlg: "px-6 py-[0.906rem] text-lg gap-1.5",
};

const roundedStyles: Record<Rounded, string> = {
  full: "rounded-full",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

const heightStyles: Record<Size, string> = {
  xsm: "h-8",
  sm: "h-9",
  md: "h-10",
  xl: "h-11",
  lg: "h-12",
  xll: "h-12",
  xlg: "h-[2.25rem]",
};

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

const Spinner: React.FC<{ size: Size }> = ({ size }) => {
  const spinnerSize: Record<Size, string> = {
    xsm: "w-3 h-3",
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    xl: "w-4.5 h-4.5",
    lg: "w-5 h-5",
    xll: "w-5 h-5",
    xlg: "w-5 h-5",
  };

  return (
    <svg
      className={cn("animate-spin shrink-0", spinnerSize[size])}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
};

// ─── GenericButton ───────────────────────────────────────────────────────────

export const GenericButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      rounded = "lg",
      height,
      fullWidth = false,
      loading = false,
      icon,
      iconPosition = "left",
      disabled,
      children,
      className,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        onClick={!isDisabled ? onClick : undefined}
        className={cn(
          // Base
          "inline-flex items-center justify-center",
          "transition-colors duration-150 ease-in-out",
          "outline-none select-none whitespace-nowrap cursor-pointer",
          // Variant, Size, Radius
          variantStyles[variant],
          sizeStyles[size],
          roundedStyles[rounded],
          height && heightStyles[height],
          // Width
          fullWidth && "w-full",
          // Caller overrides (use sparingly)
          className,
        )}
        {...rest}
      >
        {/* Left: spinner or left-icon */}
        {loading ? (
          <Spinner size={size} />
        ) : (
          icon &&
          iconPosition === "left" && (
            <span className="shrink-0" aria-hidden="true">
              {icon}
            </span>
          )
        )}

        {/* Label */}
        <span>{children}</span>

        {/* Right icon (hidden while loading) */}
        {!loading && icon && iconPosition === "right" && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
      </button>
    );
  },
);

GenericButton.displayName = "GenericButton";

export default GenericButton;
