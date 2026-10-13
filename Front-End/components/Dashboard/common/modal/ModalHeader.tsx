import React from "react";
import { cn } from "@/lib/utils";

interface ModalHeaderProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  align?: "left" | "center" | "between";
  wrapperClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  padding?: "sm" | "md" | "lg" | "xl" | "none";
  showDivider?: boolean;
  dividerClassName?: string;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "px-5 pt-5 pb-4",
  lg: "p-7",
  xl: "p-10",
};

const alignStyles = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  between: "justify-between text-left",
};

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  subtitle,
  icon,
  actions,
  align = "between",
  padding = "md",
  showDivider = true,
  wrapperClassName,
  titleClassName,
  subtitleClassName,
  dividerClassName,
}) => {
  return (
    <div
      className={cn(
        "flex items-start gap-3 bg-white dark:bg-gray-800",
        paddingStyles[padding],
        alignStyles[align],
        showDivider && "border-b",
        dividerClassName || "border-gray-100 dark:border-gray-800",
        wrapperClassName
      )}
    >
      {/* Left */}
      <div className="flex items-start gap-3 flex-1">
        {icon && <div>{icon}</div>}

        <div>
          {title && (
            <h2
              className={cn(
                "font-medium leading-[130%]",
                "text-lg text-black dark:text-white",
                titleClassName
              )}
            >
              {title}
            </h2>
          )}

          {subtitle && (
            <p
              className={cn(
                "text-sm leading-[160%] text-gray-500 dark:text-gray-400",
                subtitleClassName
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right actions */}
      {actions && <div>{actions}</div>}
    </div>
  );
};