import { Armchair, Bell, Building2, Camera, Flower2, Music, Search, SlidersHorizontal, Sparkles, Star, UtensilsCrossed } from "lucide-react";
import { sample } from "../../content";
import { Card, PhotoTile, Screen } from "./ui";

const CATS = [
  { label: "Glam", icon: Sparkles },
  { label: "Decor", icon: Flower2 },
  { label: "DJs", icon: Music },
  { label: "Catering", icon: UtensilsCrossed },
  { label: "Rentals", icon: Armchair },
  { label: "Photo", icon: Camera },
  { label: "Venues", icon: Building2 },
];

export default function HomeScreen() {
  return (
    <Screen className="gap-3 px-4">
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-ink-600">Good morning</p>
          <p className="text-[17px] font-extrabold">Hi {sample.user}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-full bg-white shadow-sm">
          <Bell className="size-4" />
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-orchid-500/30 bg-white px-3 py-2.5 text-ink-600">
        <Search className="size-4" />
        <span className="flex-1">Search vendors or services</span>
        <SlidersHorizontal className="size-4 text-plum-700" />
      </div>
      <div className="rounded-2xl bg-brand p-4 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">Protected booking</p>
        <p className="mt-1 text-[15px] font-bold leading-tight">Pay through Vendly. The vendor is paid when the job is done.</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {CATS.slice(0, 8).map(({ label, icon: Icon }, i) => (
          <div key={label} className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 ${i === 0 ? "bg-plum-900 text-white" : "bg-white"}`}>
            <Icon className="size-5" strokeWidth={1.6} />
            <span className="text-[10px] font-semibold">{label}</span>
          </div>
        ))}
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-2.5 text-[10px] font-semibold text-plum-700">More</div>
      </div>
      <p className="text-[13px] font-bold">Top rated near you</p>
      <Card className="flex gap-3 p-2">
        <PhotoTile icon={Sparkles} className="size-16 rounded-xl" />
        <div className="flex-1 py-1">
          <p className="font-bold">{sample.vendor.name}</p>
          <p className="text-ink-600">{sample.vendor.category} · {sample.vendor.city}</p>
          <p className="mt-1 flex items-center gap-1 font-semibold">
            <Star className="size-3 fill-[#F2B23E] text-[#F2B23E]" /> {sample.vendor.rating} ({sample.vendor.reviews})
          </p>
        </div>
      </Card>
    </Screen>
  );
}
