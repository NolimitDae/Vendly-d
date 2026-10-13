"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { roles, type RoleKey } from "./content";
import SectionHeading from "./SectionHeading";
import PhoneFrame from "./phone/PhoneFrame";
import HomeScreen from "./phone/screens/HomeScreen";
import VendorDashboardScreen from "./phone/screens/VendorDashboardScreen";
import PlannerEventScreen from "./phone/screens/PlannerEventScreen";

const SCREENS: Record<RoleKey, { Screen: () => React.ReactElement; label: string }> = {
  customers: { Screen: HomeScreen, label: "The Vendly customer home screen" },
  vendors: { Screen: VendorDashboardScreen, label: "The Vendly vendor dashboard" },
  planners: { Screen: PlannerEventScreen, label: "A Vendly planner's event: budget, booked vendors and the event group chat" },
};

const isRole = (v: string): v is RoleKey => roles.some((r) => r.key === v);

export default function Roles() {
  const [tab, setTab] = useState<RoleKey>("customers");

  // The navbar's "For planners" link lands here with #planners; open that tab.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#planners") setTab("planners");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <section id="planners" aria-labelledby="roles-title" className="scroll-mt-24 bg-white py-24 sm:py-32 dark:bg-[#16061a]">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHeading
          id="roles-title"
          eyebrow="One app, three roles"
          title="Built for everyone at the event"
          body="One account can book and sell. Switch between them whenever you need to."
        />

        <Tabs value={tab} onValueChange={(v) => isRole(v) && setTab(v)} className="mt-14 gap-12">
          <TabsList className="mx-auto flex h-auto w-fit flex-wrap justify-center gap-1 rounded-full bg-blush-100 p-1.5 dark:bg-white/10">
            {roles.map((r) => (
              <TabsTrigger
                key={r.key}
                value={r.key}
                className="cursor-pointer rounded-full px-5 py-2.5 text-sm font-bold text-plum-700 transition-colors data-[state=active]:bg-brand data-[state=active]:text-white data-[state=active]:shadow-md sm:px-7 dark:text-orchid-300 dark:data-[state=active]:text-white"
              >
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {roles.map((r) => {
            const { Screen, label } = SCREENS[r.key];
            return (
              <TabsContent key={r.key} value={r.key} className="grid items-center gap-12 lg:grid-cols-2 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-4 motion-reduce:animate-none">
                <div>
                  <h3 className="text-3xl font-extrabold tracking-[-0.02em] text-plum-900 sm:text-4xl dark:text-white">{r.title}</h3>
                  <ul className="mt-8 space-y-4">
                    {r.points.map((pt) => (
                      <li key={pt} className="flex gap-4 text-lg text-ink-600 dark:text-white/70">
                        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand text-white">
                          <Check className="size-4" />
                        </span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mx-auto">
                  <PhoneFrame width={280} label={label}>
                    <Screen />
                  </PhoneFrame>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </section>
  );
}
