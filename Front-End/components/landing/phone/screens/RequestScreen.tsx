import { CalendarDays, Check, Flower2, ImagePlus, Sparkles } from "lucide-react";
import { money, sample } from "../../content";
import { Button, Card, PhotoTile, Screen, TopBar } from "./ui";

export default function RequestScreen() {
  const b = sample.booking;
  return (
    <Screen className="gap-3 px-4">
      <TopBar title="Booking request" />
      <Card className="flex items-center justify-between">
        <div>
          <p className="font-bold">{b.package}</p>
          <p className="flex items-center gap-1 text-ink-600"><CalendarDays className="size-3" /> {b.date} · {b.time}</p>
        </div>
        <span className="font-bold">{money(b.price)}</span>
      </Card>
      <div>
        <p className="mb-1 font-bold">Notes for the vendor</p>
        <Card className="min-h-[64px] text-ink-600">{b.note}</Card>
      </div>
      <div className="flex gap-2">
        <PhotoTile icon={Sparkles} hue={0} className="size-14 rounded-xl" />
        <PhotoTile icon={Flower2} hue={2} className="size-14 rounded-xl" />
        <div className="grid size-14 place-items-center rounded-xl border border-dashed border-plum-900/25 text-plum-700">
          <ImagePlus className="size-5" />
        </div>
      </div>
      <Card className="space-y-2">
        <p className="font-bold">Contract</p>
        <p className="text-ink-600">Vendly beauty contract · {sample.vendor.name}</p>
        <div className="rounded-xl bg-blush-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-ink-600">Signed as</p>
          <p className="font-[cursive] text-[18px] leading-tight text-plum-900">Maya Okafor</p>
        </div>
        <p className="flex items-center gap-1.5 text-[11px]">
          <span className="grid size-4 place-items-center rounded bg-plum-900 text-white"><Check className="size-3" /></span>
          I have read and agree to this contract
        </p>
      </Card>
      <div className="mt-auto pb-5">
        <Button>Sign and send request</Button>
      </div>
    </Screen>
  );
}
