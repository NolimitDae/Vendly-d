import { cva } from "class-variance-authority";

export const inputStyles = cva(
  "w-full rounded-full transition outline-none flex items-center gap-2 ",
  {
    variants: {
      size: {
        sm: "text-sm px-2 py-1",
        md: "text-sm px-4 py-2.5",
        lg: "text-base px-4 py-3",
      },
      variant: { 
        outlined: "border border-borderColor bg-grayBg",
        filled: "bg-gray-100 border border-transparent",
        ghost: "bg-transparent border border-transparent",
      },
      state: {
        default: "",
        error: "border-red-500",
        disabled: "opacity-50 cursor-not-allowed",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "outlined",
      state: "default",
    },
  },
);
