import { Lock, ShieldCheck } from "lucide-react";
import { money, pricing, sample } from "../../content";
import { Button, Card, Row, Screen, TopBar } from "./ui";

export default function CheckoutScreen() {
  const price = sample.booking.price;
  const fee = Math.min((price * pricing.example.feePercent) / 100, pricing.example.feeMaximum);
  return (
    <Screen className="gap-3 px-4">
      <TopBar title="Checkout" />
      <Card>
        <p className="font-bold">{sample.vendor.name}</p>
        <p className="text-ink-600">{sample.booking.package} · {sample.booking.date}</p>
      </Card>
      <Card>
        <Row label="Vendor price" value={money(price)} />
        <Row label={`Vendly Protection fee (${pricing.example.feePercent}%)`} value={money(fee)} />
        <Row label="Total" value={money(price + fee)} strong />
      </Card>
      <Card>
        <p className="font-bold">Payment schedule</p>
        <p className="text-ink-600">Set by {sample.vendor.name}: paid in full when they accept your request.</p>
      </Card>
      <div className="flex gap-3 rounded-2xl border border-orchid-500/30 bg-white p-3">
        <ShieldCheck className="size-6 shrink-0 text-orchid-500" />
        <p>
          <span className="font-bold">Held by Vendly.</span>{" "}
          <span className="text-ink-600">{sample.vendor.name} is paid once the job is done.</span>
        </p>
      </div>
      <div className="mt-auto space-y-2 pb-5">
        <div className="rounded-full bg-black py-3 text-center text-[13px] font-bold text-white">Apple Pay</div>
        <Button variant="ghost">
          <span className="inline-flex items-center gap-1"><Lock className="size-3" /> Pay with card</span>
        </Button>
      </div>
    </Screen>
  );
}
