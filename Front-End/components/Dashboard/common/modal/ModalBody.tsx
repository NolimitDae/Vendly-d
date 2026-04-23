import React from "react";
import { cn } from "@/lib/utils";

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg" | "xl";
  background?: "transparent" | "default" | "muted" | "custom";
  scroll?: "auto" | "inside" | "none";
  maxHeight?: string;
  blur?: boolean;
  showDivider?: boolean;
  dividerClassName?: string;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "px-5 py-4",
  lg: "p-7",
  xl: "p-10",
};

const backgroundStyles = {
  transparent: "",
  default: "bg-white",
  muted: "bg-gray-50",
  custom: "", // controlled via className
};

const scrollStyles = {
  none: "",
  auto: "overflow-y-auto",
  inside: "overflow-y-auto",
};

const ModalBody: React.FC<ModalBodyProps> = ({
  children,
  className,
  padding = "md",
  background = "default",
  scroll = "auto",
  maxHeight = "80vh",
  blur = false,
  showDivider = false,
  dividerClassName,
}) => {
  return (
    <div
      className={cn(
        paddingStyles[padding],
        backgroundStyles[background],
        scrollStyles[scroll],
        blur && "backdrop-blur-md",
        showDivider && "border-b",
        dividerClassName || "border-gray-100",
        className,
      )}
      style={{
        maxHeight: scroll !== "none" ? maxHeight : undefined,
      }}
    >
      {children}
    </div>
  );
};

export default ModalBody;
