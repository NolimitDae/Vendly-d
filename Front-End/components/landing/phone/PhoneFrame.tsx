import { cn } from "@/lib/utils";

export const SCREEN_W = 300;
export const SCREEN_H = 640;
const BEZEL = 10;

interface PhoneFrameProps {
  /** Rendered width of the whole device in px; the screen content scales to fit. */
  width?: number;
  /** Short description of what the phone shows, for screen readers. */
  label: string;
  className?: string;
  children: React.ReactNode;
}

export default function PhoneFrame({ width = 300, label, className, children }: PhoneFrameProps) {
  const outerW = SCREEN_W + BEZEL * 2;
  const outerH = SCREEN_H + BEZEL * 2;
  const scale = width / outerW;

  return (
    <div role="img" aria-label={label} className={cn("relative shrink-0", className)} style={{ width, height: outerH * scale }}>
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 origin-top-left rounded-[52px] bg-[#16081a] p-[10px] shadow-[0_40px_80px_-20px_rgba(30,8,34,0.55),inset_0_0_0_1.5px_rgba(255,255,255,0.14)]"
        style={{ width: outerW, height: outerH, transform: `scale(${scale})` }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[42px] bg-white text-plum-900">
          <StatusBar />
          <div className="absolute inset-x-0 bottom-0 top-[44px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-[44px] items-center justify-between px-7 text-[13px] font-semibold">
      <span>9:41</span>
      <span className="absolute left-1/2 top-[10px] h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-[#16081a]" />
      <span className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-current" style={{ height: h }} />
          ))}
        </span>
        <span className="ml-1 h-[11px] w-[22px] rounded-[3px] border border-current p-[1.5px]">
          <span className="block h-full w-[75%] rounded-[1.5px] bg-current" />
        </span>
      </span>
    </div>
  );
}
