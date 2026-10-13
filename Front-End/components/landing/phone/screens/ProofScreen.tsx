import { Camera, Check, Clock, MapPin, Sparkles } from "lucide-react";
import { sample } from "../../content";
import { Card, PhotoTile, Pill, Screen, TopBar } from "./ui";

const TIMELINE = [
  { label: "Payment held", done: true },
  { label: "Contract signed", done: true },
  { label: "Proof photo uploaded", done: true },
  { label: "Payment released", done: false },
];

export default function ProofScreen() {
  return (
    <Screen className="gap-3 px-4">
      <TopBar title="Booking" />
      <Card className="space-y-2 p-2">
        <div className="relative">
          <PhotoTile icon={Sparkles} hue={2} className="h-[150px] w-full rounded-xl" />
          <span className="absolute left-2 top-2"><Pill tone="green"><Camera className="size-3" /> In-app proof</Pill></span>
        </div>
        <div className="flex items-center justify-between px-1 text-[10px] text-ink-600">
          <span className="flex items-center gap-1"><Clock className="size-3" /> {sample.booking.date}, 9:12 AM</span>
          <span className="flex items-center gap-1"><MapPin className="size-3" /> Westin, Atlanta</span>
        </div>
      </Card>
      <Card>
        <p className="mb-2 font-bold">Payment timeline</p>
        <ol className="space-y-2.5">
          {TIMELINE.map((t) => (
            <li key={t.label} className="flex items-center gap-2">
              <span className={`grid size-5 place-items-center rounded-full ${t.done ? "bg-plum-900 text-white" : "border border-plum-900/25"}`}>
                {t.done && <Check className="size-3" />}
              </span>
              <span className={t.done ? "font-semibold" : "text-ink-600"}>{t.label}</span>
            </li>
          ))}
        </ol>
      </Card>
      <p className="px-1 text-ink-600">Confirm the work is done to release the payment to {sample.vendor.name}.</p>
    </Screen>
  );
}
