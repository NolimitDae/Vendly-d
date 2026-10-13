import { MessagesSquare, Users } from "lucide-react";
import { money, sample } from "../../content";
import { Card, Pill, Screen, TopBar } from "./ui";

export default function PlannerEventScreen() {
  const e = sample.planner;
  const pct = Math.round((e.booked / e.budget) * 100);
  return (
    <Screen className="gap-3 px-4">
      <TopBar title={e.event} />
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-ink-600">Budget</span>
          <span className="font-bold">{money(e.booked)} <span className="font-normal text-ink-600">of {money(e.budget)}</span></span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-blush-100">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      </Card>
      <p className="flex items-center gap-1 font-bold"><Users className="size-3.5" /> Vendors · {e.vendors.length}</p>
      <div className="space-y-2">
        {e.vendors.map((v) => (
          <Card key={v.name} className="flex items-center justify-between py-2.5">
            <div>
              <p className="font-semibold">{v.name}</p>
              <p className="text-[10px] text-ink-600">{v.role}</p>
            </div>
            <Pill tone={v.status === "Proof uploaded" ? "green" : "plum"}>{v.status}</Pill>
          </Card>
        ))}
      </div>
      <Card className="flex items-center gap-2 bg-plum-900 text-white">
        <MessagesSquare className="size-4" />
        <span className="flex-1 font-semibold">Event group chat</span>
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">3 new</span>
      </Card>
    </Screen>
  );
}
