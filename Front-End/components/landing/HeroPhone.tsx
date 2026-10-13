"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import PhoneFrame from "./phone/PhoneFrame";
import HomeScreen from "./phone/screens/HomeScreen";
import ProfileScreen from "./phone/screens/ProfileScreen";
import ConfirmedScreen from "./phone/screens/ConfirmedScreen";
import { prefersReducedMotion, useGsap } from "./motion/useGsap";

const SCREENS = [HomeScreen, ProfileScreen, ConfirmedScreen];
const CYCLE_MS = 3600;

/** Hero phone: cross-fades through app screens and tilts toward the pointer on desktop. */
export default function HeroPhone({ width }: { width: number }) {
  const [active, setActive] = useState(0);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % SCREENS.length), CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  useGsap(({ gsap, isDesktop }) => {
    const el = tiltRef.current;
    const stage = el?.closest("section");
    if (!el || !stage || !isDesktop) return;
    gsap.set(el, { transformPerspective: 1200 });
    const rotY = gsap.quickTo(el, "rotationY", { duration: 0.8, ease: "power3.out" });
    const rotX = gsap.quickTo(el, "rotationX", { duration: 0.8, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      rotY(((e.clientX - r.left) / r.width - 0.5) * 18);
      rotX(-((e.clientY - r.top) / r.height - 0.5) * 12);
    };
    const reset = () => {
      rotY(-8);
      rotX(4);
    };
    reset();
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", reset);
    return () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", reset);
    };
  });

  return (
    <div ref={tiltRef} className="will-change-transform">
      <PhoneFrame width={width} label="The Vendly app: home screen, a vendor profile, and a confirmed booking with a signed contract and held payment">
        {SCREENS.map((S, i) => (
          <div
            key={i}
            className={cn("absolute inset-0 transition-opacity duration-700 ease-out", i === active ? "opacity-100" : "opacity-0")}
          >
            <S />
          </div>
        ))}
      </PhoneFrame>
    </div>
  );
}
