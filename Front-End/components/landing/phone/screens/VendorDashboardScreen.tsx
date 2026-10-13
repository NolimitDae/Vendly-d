import { Armchair, CalendarDays } from "lucide-react";
import { money, sample } from "../../content";
import { Card, Pill, Screen } from "./ui";

export default function VendorDashboardScreen() {
  const d = sample.vendorDashboard;
  return (
    <Screen className="gap-3 px-4">
      <div className="pt-1">
        <p className="text-ink-600">Dashboard</p>
        <p className="text-[17px] font-extrabold">{d.business}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Requests", v: String(d.requests) },
          { k: "Upcoming", v: String(d.upcoming) },
          { k: "Held", v: money(d.held) },
        ].map((s) => (
          <Card key={s.k} className="px-2 py-2.5 text-center">
            <p className="text-[15px] font-extrabold">{s.v}</p>
            <p className="text-[10px] text-ink-600">{s.k}</p>
          </Card>
        ))}
      </div>
      <p className="font-bold">New request</p>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold">Garden wedding decor</span>
          <span className="font-bold">{money(2800)}</span>
        </div>
        <p className="flex items-center gap-1 text-ink-600"><CalendarDays className="size-3" /> Sat, Jun 21 · 120 guests</p>
        <div className="flex gap-2 pt-1">
          <span className="flex-1 rounded-full bg-brand py-2 text-center font-bold text-white">Accept and sign</span>
          <span className="flex-1 rounded-full border border-plum-900/15 py-2 text-center font-bold">Decline</span>
        </div>
      </Card>
      <p className="font-bold">Rental stock · Jun 21</p>
      <Card className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-blush-100"><Armchair className="size-5" /></span>
        <div className="flex-1">
          <p className="font-semibold">Gold chiavari chairs</p>
          <p className="text-ink-600">120 owned · 40 reserved</p>
        </div>
        <Pill tone="green">80 free</Pill>
      </Card>
    </Screen>
  );
}
