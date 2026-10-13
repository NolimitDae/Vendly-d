"use client";

import { useGsap } from "./useGsap";

/**
 * Page-wide scroll effects, driven by data attributes so sections stay server-rendered:
 * - data-reveal            fade and rise in when scrolled into view
 * - data-reveal-group      same, staggered across direct children
 * - data-parallax="0.15"   drift vertically while scrolling (fraction of element height)
 * - data-scrub-words       children scale up and light in, tied to scroll position
 * - data-magnetic          follows the pointer slightly on hover (desktop only)
 * Without JavaScript or with reduced motion, everything simply renders in place.
 */
export default function LandingMotion() {
  useGsap(({ gsap, ScrollTrigger, isDesktop }) => {
    // fromTo with explicit end values: a plain `from` re-reads the end state on refresh, and can
    // capture a half-finished CSS transition (opacity 0) as the end, leaving content invisible.
    gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
      gsap.fromTo(el, { y: 48, autoAlpha: 0 }, {
        y: 0,
        autoAlpha: 1,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

    gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
      gsap.fromTo(group.children, { y: 40, autoAlpha: 0 }, {
        y: 0,
        autoAlpha: 1,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
        scrollTrigger: { trigger: group, start: "top 85%", once: true },
      });
    });

    gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
      const amount = Number(el.dataset.parallax) || 0.15;
      gsap.fromTo(
        el,
        { yPercent: amount * 100 },
        {
          yPercent: -amount * 100,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
        },
      );
    });

    gsap.utils.toArray<HTMLElement>("[data-scrub-words]").forEach((wrap) => {
      gsap.fromTo(
        wrap.children,
        { scale: 0.7, autoAlpha: 0.12 },
        {
          scale: 1,
          autoAlpha: 1,
          ease: "none",
          stagger: 0.35,
          scrollTrigger: { trigger: wrap, start: "top 85%", end: "bottom 45%", scrub: 0.6 },
        },
      );
    });

    const cleanups: (() => void)[] = [];
    if (isDesktop) {
      gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((el) => {
        const toX = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
        const toY = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          toX((e.clientX - (r.left + r.width / 2)) * 0.25);
          toY((e.clientY - (r.top + r.height / 2)) * 0.35);
        };
        const reset = () => {
          toX(0);
          toY(0);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", reset);
        cleanups.push(() => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", reset);
        });
      });
    }

    // Fonts and images can shift layout after load; recompute trigger positions once settled.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh, { once: true });
    cleanups.push(() => window.removeEventListener("load", refresh));

    return () => cleanups.forEach((fn) => fn());
  });

  return null;
}
