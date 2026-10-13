import { CalendarDays, Check, FileSignature, MessageCircle, ShieldCheck } from "lucide-react";
import { money, sample } from "../../content";
import { Card, Pill, Screen } from "./ui";

export default function ConfirmedScreen() {
  const b = sample.booking;
  return (
    <Screen className="gap-3 px-4 pt-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-brand text-white">
          <Check className="size-8" strokeWidth={2.5} />
        </span>
        <p className="text-[18px] font-extrabold">Booking confirmed</p>
        <p className="text-ink-600">{sample.vendor.name} accepted your request</p>
      </div>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold">{b.package}</span>
          <span className="font-bold">{money(b.price)}</span>
        </div>
        <p className="flex items-center gap-1 text-ink-600"><CalendarDays className="size-3" /> {b.date} · {b.time}</p>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="green"><FileSignature className="size-3" /> Contract signed</Pill>
          <Pill><ShieldCheck className="size-3" /> Payment held</Pill>
        </div>
      </Card>
      <Card className="space-y-2">
        <p className="flex items-center gap-1 font-bold"><MessageCircle className="size-3.5" /> Messages</p>
        <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-plum-900 px-3 py-2 text-white">Can we do warm tones?</div>
        <div className="w-fit max-w-[80%] rounded-2xl rounded-bl-sm bg-blush-100 px-3 py-2">Absolutely. See you Saturday at 9!</div>
      </Card>
    </Screen>
  );
}
