"use client";

import { useEffect, type DependencyList } from "react";
import type { gsap as GsapType } from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";

export type Gsap = typeof GsapType;
export type ScrollTriggerStatic = typeof ScrollTriggerType;
export interface MotionTools {
  gsap: Gsap;
  ScrollTrigger: ScrollTriggerStatic;
  /** Desktop with a mouse: pointer tilt, pinning and magnetic hover. */
  isDesktop: boolean;
  /** "Reduce motion" is on: fade only, never move, scale or loop. */
  reduced: boolean;
}
/** May return a cleanup (e.g. removing event listeners); GSAP runs it when the context is reverted. */
type Setup = (tools: MotionTools) => void | (() => void);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isDesktopPointer = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;

/**
 * Runs a GSAP setup client-side only. GSAP is loaded lazily and everything created inside `setup`
 * is reverted on unmount. Reduced-motion users still get GSAP so content can fade in; each setup
 * must honour `reduced` by not moving anything.
 */
export function useGsap(setup: Setup, deps: DependencyList = []) {
  useEffect(() => {
    let ctx: gsap.Context | undefined;
    let cancelled = false;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() =>
        setup({ gsap, ScrollTrigger, isDesktop: isDesktopPointer(), reduced: prefersReducedMotion() }),
      );
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
