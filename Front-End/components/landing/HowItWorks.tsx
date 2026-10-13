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

  useGsap(({ gsap, reduced }) => {
    if (!railRef.current || !listRef.current) return;

    // Phones (one per step on smaller screens): swing up into place in 3D as you scroll; fade only if reduced.
    gsap.utils.toArray<HTMLElement>("[data-step-phone]", listRef.current).forEach((phone) => {
      gsap.fromTo(
        phone,
        reduced
          ? { autoAlpha: 0 }
          : { autoAlpha: 0.15, y: 120, scale: 0.82, rotationX: 28, rotationY: -14, transformPerspective: 1000 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          rotationX: 0,
          rotationY: 0,
          ease: "power2.out",
          ...(reduced
            ? { duration: 0.8, scrollTrigger: { trigger: phone, start: "top 90%", once: true } }
            : { scrollTrigger: { trigger: phone, start: "top bottom", end: "center 60%", scrub: 0.5 } }),
        },
      );
    });

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
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-24 bg-white py-24 sm:py-32 dark:bg-[#16061a]">
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
            <div aria-hidden="true" className="absolute bottom-[35vh] left-[19px] top-[35vh] hidden w-px bg-plum-900/10 lg:block dark:bg-white/10">
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
                          i <= active ? "bg-brand text-white" : "bg-blush-100 text-plum-700 dark:bg-white/10 dark:text-orchid-300",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="max-w-md">
                        <h3 className="text-2xl font-extrabold tracking-[-0.01em] text-plum-900 sm:text-3xl dark:text-white">{step.title}</h3>
                        <p className="mt-3 text-lg leading-relaxed text-ink-600 dark:text-white/70">{step.body}</p>
                      </div>
                    </div>
                    {/* Per-step phone on smaller screens, where the sticky phone is hidden */}
                    <div data-step-phone className="mx-auto lg:hidden">
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
