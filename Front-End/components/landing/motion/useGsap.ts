"use client";

import { useEffect, type DependencyList } from "react";
import type { gsap as GsapType } from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";

export type Gsap = typeof GsapType;
export type ScrollTriggerStatic = typeof ScrollTriggerType;
/** May return a cleanup (e.g. removing event listeners); GSAP runs it when the context is reverted. */
type Setup = (tools: { gsap: Gsap; ScrollTrigger: ScrollTriggerStatic; isDesktop: boolean }) => void | (() => void);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Desktop with a mouse: the only place tilt, pinning and magnetic hover run. */
export const isDesktopPointer = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;

/**
 * Runs a GSAP setup client-side only. GSAP is loaded lazily, never for reduced-motion users,
 * and everything created inside `setup` is reverted on unmount.
 */
export function useGsap(setup: Setup, deps: DependencyList = []) {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let ctx: gsap.Context | undefined;
    let cancelled = false;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => setup({ gsap, ScrollTrigger, isDesktop: isDesktopPointer() }));
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
