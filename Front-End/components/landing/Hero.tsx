import Link from "next/link";
import { ArrowRight, Camera, FileSignature, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { hero, VENDOR_SIGNUP_HREF } from "./content";
import HeroPhone from "./HeroPhone";
import StoreBadges from "./StoreBadges";

const CHIP_ICONS = [FileSignature, ShieldCheck, Camera];
// Where each chip floats around the phone, and how far it drifts on scroll (parallax depth).
const CHIP_LAYOUT = [
  { pos: "left-[-30%] top-[34%]", depth: "0.35", delay: "0ms" },
  { pos: "right-[-30%] top-[14%]", depth: "0.6", delay: "1200ms" },
  { pos: "right-[-26%] bottom-[14%]", depth: "0.2", delay: "2400ms" },
];
const HIGHLIGHT_FROM = 3; // "Protected until the job is done." gets the gradient

export default function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate -mt-[112px] overflow-hidden bg-plum-950 pt-[112px] text-white"
    >
      {/* Ambient glows */}
      <div aria-hidden="true" className="landing-glow [pointer-events:none] absolute -left-40 top-20 -z-10 size-[520px] rounded-full bg-[#7A2A82]/40 blur-[120px]" />
      <div aria-hidden="true" className="landing-glow [pointer-events:none] absolute -right-32 bottom-0 -z-10 size-[600px] rounded-full bg-[#A84AB0]/30 blur-[140px] [animation-delay:-4s]" />
      <div
        aria-hidden="true"
        className="[pointer-events:none] absolute inset-0 -z-10 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />

      <div className="mx-auto grid max-w-[1240px] items-center gap-16 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pb-32 lg:pt-24">
        <div>
          <p className="landing-rise text-xs font-semibold uppercase tracking-[0.3em] text-orchid-300">{hero.eyebrow}</p>
          <h1 id="hero-title" className="mt-6 text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.75rem]">
            {hero.headline.map((word, i) => (
              <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                <span
                  className={cn(
                    "landing-word",
                    i >= HIGHLIGHT_FROM && "bg-linear-to-r from-orchid-300 via-[#E9C6EC] to-white bg-clip-text text-transparent",
                  )}
                  style={{ "--delay": `${120 + i * 70}ms` } as React.CSSProperties}
                >
                  {word}
                </span>
                {i < hero.headline.length - 1 && " "}
              </span>
            ))}
          </h1>
          <p className="landing-rise mt-7 max-w-xl text-lg leading-relaxed text-white/75" style={{ "--delay": "700ms" } as React.CSSProperties}>
            {hero.sub}
          </p>
          <div className="landing-rise mt-10 flex flex-col gap-6" style={{ "--delay": "850ms" } as React.CSSProperties}>
            <Link
              href={VENDOR_SIGNUP_HREF}
              data-magnetic
              className="group inline-flex w-fit items-center gap-3 rounded-full bg-brand px-7 py-4 text-base font-bold text-white shadow-[0_20px_50px_-15px_rgba(168,74,176,0.8)] transition-shadow hover:shadow-[0_24px_60px_-12px_rgba(168,74,176,1)]"
            >
              {hero.primary}
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <div>
              <p className="mb-3 text-sm text-white/60">{hero.secondary}</p>
              <StoreBadges />
            </div>
          </div>
        </div>

        <div className="relative mx-auto landing-rise" style={{ "--delay": "300ms" } as React.CSSProperties}>
          <HeroPhone width={290} />
          {hero.chips.map((chip, i) => {
            const Icon = CHIP_ICONS[i];
            const layout = CHIP_LAYOUT[i];
            return (
              <div key={chip.label} aria-hidden="true" data-parallax={layout.depth} className={cn("absolute hidden sm:block", layout.pos)}>
                <div
                  className="landing-float flex items-center gap-2 rounded-2xl border border-white/15 bg-plum-900/95 px-4 py-3 text-sm font-semibold shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md"
                  style={{ "--delay": layout.delay } as React.CSSProperties}
                >
                  <span className="grid size-7 place-items-center rounded-full bg-brand">
                    <Icon className="size-3.5" />
                  </span>
                  {chip.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
