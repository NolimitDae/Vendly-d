import { BadgeCheck, MapPin, Sparkles, Star } from "lucide-react";
import { money, sample } from "../../content";
import { Button, Card, PhotoTile, Screen } from "./ui";

export default function ProfileScreen() {
  const v = sample.vendor;
  return (
    <Screen>
      <PhotoTile icon={Sparkles} className="h-[150px] w-full" />
      <div className="-mt-6 flex flex-1 flex-col gap-3 rounded-t-3xl bg-blush-50 px-4 pt-4">
        <div>
          <p className="flex items-center gap-1 text-[17px] font-extrabold">
            {v.name} <BadgeCheck className="size-4 text-orchid-500" />
          </p>
          <p className="flex items-center gap-1 text-ink-600">
            <MapPin className="size-3" /> {v.city}
          </p>
        </div>
        <div className="flex gap-2">
          <Card className="flex-1 py-2 text-center">
            <p className="flex items-center justify-center gap-1 font-bold"><Star className="size-3 fill-[#F2B23E] text-[#F2B23E]" /> {v.rating}</p>
            <p className="text-[10px] text-ink-600">{v.reviews} reviews</p>
          </Card>
          <Card className="flex-1 py-2 text-center">
            <p className="font-bold">1 hr</p>
            <p className="text-[10px] text-ink-600">Response time</p>
          </Card>
          <Card className="flex-1 py-2 text-center">
            <p className="font-bold">Moderate</p>
            <p className="text-[10px] text-ink-600">Cancellation</p>
          </Card>
        </div>
        <p className="text-[13px] font-bold">Packages</p>
        {v.packages.map((p, i) => (
          <Card key={p.name} className={`flex items-center justify-between ${i === 0 ? "ring-2 ring-orchid-500" : ""}`}>
            <span className="font-semibold">{p.name}</span>
            <span className="font-bold">{money(p.price)}</span>
          </Card>
        ))}
        <div className="mt-auto pb-5">
          <Button>Request booking</Button>
        </div>
      </div>
    </Screen>
  );
}
