"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { steps, type StepScreen } from "./content";
import SectionHeading from "./SectionHeading";
import PhoneFrame from "./phone/PhoneFrame";
import ProfileScreen from "./phone/screens/ProfileScreen";
import RequestScreen from "./phone/screens/RequestScreen";
import CheckoutScreen from "./phone/screens/CheckoutScreen";
import ProofScreen from "./phone/screens/ProofScreen";
import PaidScreen from "./phone/screens/PaidScreen";
import { useGsap } from "./motion/useGsap";

const SCREENS: Record<StepScreen, () => React.ReactElement> = {
  profile: ProfileScreen,
  request: RequestScreen,
  checkout: CheckoutScreen,
  proof: ProofScreen,
  paid: PaidScreen,
};

const PHONE_LABEL = "The Vendly app showing this step of a booking";

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // Which step is in the middle of the screen. Not an animation, so it runs for reduced-motion users too.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        });
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useGsap(({ gsap }) => {
    if (!railRef.current || !listRef.current) return;
    gsap.fromTo(
      railRef.current,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        scrollTrigger: { trigger: listRef.current, start: "top center", end: "bottom center", scrub: true },
      },
    );
  });

  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-24 bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Booked, signed, protected"
          body="Every booking on Vendly follows the same five steps, so both sides always know where things stand."
        />

        <div className="mt-16 grid gap-16 lg:mt-8 lg:grid-cols-[1fr_auto] lg:gap-24">
          <div className="relative">
            {/* Progress rail (desktop) */}
            <div aria-hidden="true" className="absolute bottom-[35vh] left-[19px] top-[35vh] hidden w-px bg-plum-900/10 lg:block">
              <div ref={railRef} className="h-full w-full origin-top bg-brand" />
            </div>
            <ol ref={listRef}>
              {steps.map((step, i) => {
                const Screen = SCREENS[step.screen];
                return (
                  <li
                    key={step.title}
                    ref={(el) => {
                      stepRefs.current[i] = el;
                    }}
                    data-index={i}
                    className="flex flex-col gap-8 py-8 lg:min-h-[70vh] lg:flex-row lg:items-center lg:py-0"
                  >
                    <div
                      className={cn(
                        "flex gap-5 transition-opacity duration-500 motion-reduce:transition-none",
                        i === active ? "lg:opacity-100" : "lg:opacity-35",
                      )}
                    >
                      <span
                        className={cn(
                          "relative z-10 grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-500",
                          i <= active ? "bg-brand text-white" : "bg-blush-100 text-plum-700",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="max-w-md">
                        <h3 className="text-2xl font-extrabold tracking-[-0.01em] text-plum-900 sm:text-3xl">{step.title}</h3>
                        <p className="mt-3 text-lg leading-relaxed text-ink-600">{step.body}</p>
                      </div>
                    </div>
                    {/* Per-step phone on smaller screens, where the sticky phone is hidden */}
                    <div data-reveal className="mx-auto lg:hidden">
                      <PhoneFrame width={240} label={PHONE_LABEL}>
                        <Screen />
                      </PhoneFrame>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Sticky phone (desktop) */}
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-300px)]">
              <PhoneFrame width={290} label={PHONE_LABEL}>
                {steps.map((step, i) => {
                  const Screen = SCREENS[step.screen];
                  return (
                    <div
                      key={step.screen}
                      aria-hidden={i !== active}
                      className={cn(
                        "absolute inset-0 transition-all duration-700 ease-out motion-reduce:transition-none",
                        i === active ? "translate-y-0 opacity-100" : i < active ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0",
                      )}
                    >
                      <Screen />
                    </div>
                  );
                })}
              </PhoneFrame>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
