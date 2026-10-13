import { Check, Star } from "lucide-react";
import { sample } from "../../content";
import { Button, Card, Screen } from "./ui";

export default function PaidScreen() {
  return (
    <Screen className="items-center gap-4 px-5 pt-8 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-brand text-white shadow-[0_12px_30px_-8px_rgba(122,42,130,0.7)]">
        <Check className="size-10" strokeWidth={2.5} />
      </span>
      <div>
        <p className="text-[18px] font-extrabold">Job complete</p>
        <p className="mt-1 text-ink-600">Payment released to {sample.vendor.name}</p>
      </div>
      <Card className="w-full space-y-3 text-left">
        <p className="font-bold">How was your experience?</p>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="size-7 fill-[#F2B23E] text-[#F2B23E]" />
          ))}
        </div>
        <p className="rounded-xl bg-blush-50 p-3 text-ink-600">Ama was early, calm and my makeup lasted all night. Booking again for my sister.</p>
      </Card>
      <div className="mt-auto w-full pb-5">
        <Button>Post review</Button>
      </div>
    </Screen>
  );
}
