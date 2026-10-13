import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoVariant = "mark" | "horizontal" | "stacked";
type LogoTone = "light" | "dark";

interface LogoProps {
  variant?: LogoVariant;
  /** `light` = for light backgrounds (plum wordmark); `dark` = for dark backgrounds (white wordmark). */
  tone?: LogoTone;
  /** Height of the VM mark in px; the wordmark scales with it. */
  size?: number;
  className?: string;
}

// VM monogram traced from the owner's 1760x1120 logo: one rounded stroke, one left-to-right gradient.
// On dark backgrounds the logo's darkest plum disappears, so the mark shifts to a brighter run of the same hues.
const STOPS: Record<LogoTone, [string, string, string]> = {
  light: ["#4A1650", "#7A2A82", "#A84AB0"],
  dark: ["#9A45A3", "#B864C0", "#DDA7E2"],
};

export function LogoMark({ size = 40, tone = "light", className }: { size?: number; tone?: LogoTone; className?: string }) {
  const gradientId = useId();
  const [start, mid, end] = STOPS[tone];
  return (
    <svg
      viewBox="0 0 360 220"
      height={size}
      width={(size * 360) / 220}
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={start} />
          <stop offset="0.52" stopColor={mid} />
          <stop offset="1" stopColor={end} />
        </linearGradient>
      </defs>
      <path
        d="M30 28 108 191 186 28 258 125 330 28V191"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="57"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({ variant = "horizontal", tone = "light", size = 40, className }: LogoProps) {
  const ink = tone === "light" ? "text-plum-900" : "text-white";

  if (variant === "mark") {
    return (
      <span role="img" aria-label="Vendly" className={cn("inline-flex", className)}>
        <LogoMark size={size} tone={tone} />
      </span>
    );
  }

  if (variant === "stacked") {
    return (
      <span role="img" aria-label="Vendly Marketplace" className={cn("inline-flex flex-col items-center", className)}>
        <LogoMark size={size} tone={tone} />
        <span aria-hidden="true" className={cn("font-extrabold leading-none tracking-[-0.02em] mt-[0.35em]", ink)} style={{ fontSize: size * 0.62 }}>
          Vendly
        </span>
        <span aria-hidden="true" className={cn("font-medium leading-none uppercase tracking-[0.42em] mt-[0.7em] pl-[0.42em]", ink)} style={{ fontSize: size * 0.2 }}>
          Marketplace
        </span>
      </span>
    );
  }

  return (
    <span role="img" aria-label="Vendly" className={cn("inline-flex items-center gap-[0.3em]", className)} style={{ fontSize: size }}>
      <LogoMark size={size * 0.62} tone={tone} />
      <span aria-hidden="true" className={cn("font-extrabold leading-none tracking-[-0.02em] text-[0.62em]", ink)}>
        Vendly
      </span>
    </span>
  );
}
