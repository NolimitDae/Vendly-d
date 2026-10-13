import { ChevronLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Small building blocks shared by the phone screens. Sizes are in screen pixels (300px wide screen).

export function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex h-full flex-col bg-blush-50 text-[12px] leading-snug", className)}>{children}</div>;
}

export function TopBar({ title, back = true }: { title: string; back?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-3 pt-1">
      {back && (
        <span className="grid size-8 place-items-center rounded-full bg-white shadow-sm">
          <ChevronLeft className="size-4" />
        </span>
      )}
      <span className="text-[15px] font-bold">{title}</span>
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(58,16,64,0.06)]", className)}>{children}</div>;
}

export function Button({ children, variant = "brand", className }: { children: React.ReactNode; variant?: "brand" | "ghost"; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-full py-3 text-center text-[13px] font-bold",
        variant === "brand" ? "bg-brand text-white" : "border border-plum-900/15 bg-white text-plum-900",
        className,
      )}
    >
      {children}
    </div>
  );
}

const TILE_HUES = [
  "from-[#F7D6E8] to-[#E3B5E7]",
  "from-[#E9DDF8] to-[#C9B3EF]",
  "from-[#FCE3D6] to-[#F2B8C6]",
  "from-[#DDEFE9] to-[#B8DDD3]",
] as const;

/** Stand-in for a vendor photo: a soft gradient tile with an icon. */
export function PhotoTile({ icon: Icon, hue = 0, className }: { icon: LucideIcon; hue?: number; className?: string }) {
  return (
    <div className={cn("grid place-items-center bg-linear-to-br text-plum-900/70", TILE_HUES[hue % TILE_HUES.length], className)}>
      <Icon className="size-[40%] max-h-10 max-w-10" strokeWidth={1.5} />
    </div>
  );
}

export function Pill({ children, tone = "plum" }: { children: React.ReactNode; tone?: "plum" | "green" | "amber" }) {
  const tones = {
    plum: "bg-blush-100 text-plum-700",
    green: "bg-[#E3F5EC] text-[#1F7A4D]",
    amber: "bg-[#FDF1DC] text-[#8A5A0B]",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", tones[tone])}>{children}</span>;
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-1", strong && "border-t border-plum-900/10 pt-2 text-[13px] font-bold")}>
      <span className={strong ? "" : "text-ink-600"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
