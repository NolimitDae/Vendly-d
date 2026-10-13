import AppleIcon from "@/icons/AppleIcon";
import PlayStoreIcon from "@/icons/PlayStoreIcon";
import { cn } from "@/lib/utils";

/** Not links: the app isn't in the stores yet. */
export default function StoreBadges({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  const badge = cn(
    "flex items-center justify-center gap-3 rounded-2xl px-4 py-2.5 sm:justify-start",
    tone === "dark" ? "border border-white/15 bg-white/5 text-white" : "border border-plum-900/10 bg-white text-plum-900",
  );
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {[
        // The Apple icon is white, so it is recoloured on light badges; the Play icon keeps its colours.
        { icon: <AppleIcon />, store: "App Store", mono: true },
        { icon: <PlayStoreIcon />, store: "Google Play", mono: false },
      ].map(({ icon, store, mono }) => (
        <div key={store} className={badge}>
          <span className={cn("grid size-8 place-items-center [&_svg]:max-h-7 [&_svg]:max-w-7", tone === "light" && mono && "[&_path]:fill-plum-900")}>{icon}</span>
          <span className="leading-tight">
            <span className="block text-[11px] opacity-70">Coming soon to</span>
            <span className="block text-[15px] font-semibold">{store}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
