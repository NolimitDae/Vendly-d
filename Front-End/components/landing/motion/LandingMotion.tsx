"use client";

import { useGsap } from "./useGsap";

/**
 * Page-wide scroll effects, driven by data attributes so sections stay server-rendered:
 * - data-reveal            fade and rise in when scrolled into view
 * - data-reveal-group      same, staggered across direct children (cards also scale up slightly)
 * - data-parallax="0.15"   drift vertically while scrolling (fraction of element height)
 * - data-scrub-words       children scale up and light in, tied to scroll position
 * - data-countup           the first number in the text counts up from 0 when it comes into view
 * - data-magnetic          follows the pointer slightly on hover (desktop only)
 * Reduced motion: reveals fade without moving; parallax, scaling, count-ups and magnetism are off.
 * Without JavaScript everything simply renders in place.
 */
export default function LandingMotion() {
  useGsap(({ gsap, ScrollTrigger, isDesktop, reduced }) => {
    // fromTo with explicit end values: a plain `from` re-reads the end state on refresh, and can
    // capture a half-finished CSS transition (opacity 0) as the end, leaving content invisible.
    gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
      gsap.fromTo(el, { y: reduced ? 0 : 72, autoAlpha: 0 }, {
        y: 0,
        autoAlpha: 1,
        duration: reduced ? 0.8 : 1.1,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      });
    });

    gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
      gsap.fromTo(group.children, { y: reduced ? 0 : 56, scale: reduced ? 1 : 0.94, autoAlpha: 0 }, {
        y: 0,
        scale: 1,
        autoAlpha: 1,
        duration: reduced ? 0.7 : 1,
        ease: "power3.out",
        stagger: 0.09,
        scrollTrigger: { trigger: group, start: "top 88%", once: true },
      });
    });

    if (!reduced) {
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

      gsap.utils.toArray<HTMLElement>("[data-countup]").forEach((el) => {
        const original = el.textContent ?? "";
        const match = original.match(/\d[\d,]*/);
        if (!match) return;
        const target = Number(match[0].replace(/,/g, ""));
        const counter = { value: 0 };
        // The real number stays in place until the count actually starts, so a trigger that never
        // fires can't leave a wrong price ("$0") on screen.
        gsap.to(counter, {
          value: target,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
          onStart: () => {
            el.textContent = original.replace(match[0], "0");
          },
          onUpdate: () => {
            el.textContent = original.replace(match[0], Math.round(counter.value).toLocaleString("en-US"));
          },
          onComplete: () => {
            el.textContent = original;
          },
        });
      });
    }

    gsap.utils.toArray<HTMLElement>("[data-scrub-words]").forEach((wrap) => {
      gsap.fromTo(
        wrap.children,
        { scale: reduced ? 1 : 0.7, autoAlpha: 0.12 },
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
    if (isDesktop && !reduced) {
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
