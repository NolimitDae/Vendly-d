"use client";
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDownIcon } from "@/icons";

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export interface SelectOption {
  label: string;
  value: string;
  className?: string;
  icon?: React.ReactNode;
}

export type SelectVariant = "primary" | "outline" | "ghost";

export interface GenericSelectProps {
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  label?: string;
  variant?: SelectVariant;
  textSize?: string;
  textColor?: string;
  placeholderColor?: string;
  width?: string;
  height?: string;
  padding?: string;
  borderColor?: string;
  borderWidth?: string;
  borderRadius?: string;
  focusBorderColor?: string;
  hoverBorderColor?: string;
  hoverTextColor?: string;
  shadow?: string;
  dropdownClassName?: string;
  dropdownShadow?: string;
  dropdownBg?: string;
  itemClassName?: string;
  itemHoverBg?: string;
  itemHoverText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode | null;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabledClassName?: string;
  wrapperClassName?: string;
  className?: string;
}

const VARIANT_DEFAULTS: Record<SelectVariant, string> = {
  primary: "bg-white border border-gray-200 text-gray-900",
  outline: "bg-transparent border border-gray-400 text-gray-900",
  ghost: "bg-gray-100 border border-transparent text-gray-700",
};

const GenericSelect = ({
  label,
  options,
  placeholder = "Select…",
  value,
  onValueChange,
  defaultValue,
  disabled,
  variant = "primary",
  textSize = "text-sm",
  textColor,
  placeholderColor = "text-gray-400",
  width = "w-full",
  height = "h-10",
  padding = "px-3",
  borderColor,
  borderWidth,
  borderRadius = "rounded-lg",
  focusBorderColor = "focus-visible:ring-2 focus-visible:ring-purpleOne/20",
  hoverBorderColor = "hover:border-borderColor",
  hoverTextColor,
  shadow = "shadow-none",
  dropdownClassName,
  dropdownShadow = "shadow-lg",
  dropdownBg = "bg-white",
  itemClassName,
  itemHoverBg = "focus:bg-gray-50",
  itemHoverText = "focus:text-purpleOne",
  leftIcon,
  rightIcon,
  searchable = false,
  searchPlaceholder = "Search...",
  disabledClassName = "opacity-50 cursor-not-allowed",
  wrapperClassName,
  className,
}: GenericSelectProps) => {
  const variantBase = VARIANT_DEFAULTS[variant];
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [options, searchQuery]);

  return (
    <div className={cn("relative", width, wrapperClassName)}>
      {label && (
        <label className="block text-blackColor text-sm font-medium leading-[160%] mb-2">
          {label}
        </label>
      )}
      <Select
        value={value}
        onValueChange={onValueChange}
        onOpenChange={(open) => {
          if (!open) setSearchQuery("");
        }}
        defaultValue={defaultValue}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            "flex w-full items-center justify-between transition-all duration-200 cursor-pointer",
            variantBase,
            height,
            padding,
            textSize,
            borderWidth,
            borderColor,
            borderRadius,
            focusBorderColor,
            hoverBorderColor,
            hoverTextColor,
            shadow,
            !value && placeholderColor,
            textColor,
            disabled && disabledClassName,
            className,
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            <SelectValue placeholder={placeholder} />
          </div>
        </SelectTrigger>

        <SelectContent
          className={cn(
            "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 mt-1",
            dropdownBg,
            dropdownShadow,
            dropdownClassName,
          )}
        >
          {searchable && (
            <div className="p-2 border-b">
              <input
                type="text"
                className="w-full px-2 py-1 text-xs border rounded outline-none focus:border-purpleOne"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()} // Prevent select from closing on space
              />
            </div>
          )}
          <div className="p-1 max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className={cn(
                    "relative flex w-full select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none transition-colors cursor-pointer",
                    itemHoverBg,
                    itemHoverText,
                    itemClassName,
                    opt.className,
                  )}
                >
                  <div className="flex items-center gap-2">
                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                    <span>{opt.label}</span>
                  </div>
                </SelectItem>
              ))
            ) : (
              <div className="py-2 px-2 text-xs text-center text-gray-500">
                No results found
              </div>
            )}
          </div>
        </SelectContent>
      </Select>
    </div>
  );
};

GenericSelect.displayName = "GenericSelect";

export default GenericSelect;
