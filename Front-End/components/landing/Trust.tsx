import { BadgeCheck, Camera, FileSignature, LifeBuoy, ShieldCheck } from "lucide-react";
import { trust } from "./content";

const ICONS = [ShieldCheck, Camera, FileSignature, BadgeCheck, LifeBuoy];

export default function Trust() {
  return (
    <section aria-labelledby="trust-title" className="relative isolate overflow-hidden bg-plum-950 py-24 text-white sm:py-36">
      <div aria-hidden="true" className="[pointer-events:none] absolute inset-x-0 top-0 -z-10 h-px bg-linear-to-r from-transparent via-orchid-500/50 to-transparent" />
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <p data-reveal className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-orchid-300">
          Trust & safety
        </p>
        {/* Big words that grow and light up as you scroll */}
        <h2 id="trust-title" aria-label={trust.words.join(" ")} data-scrub-words className="mt-8 flex flex-col items-center text-center text-[18vw] font-extrabold leading-[0.9] tracking-[-0.05em] sm:flex-row sm:justify-center sm:gap-[0.25em] sm:text-[10vw] lg:text-[8rem]">
          {trust.words.map((w) => (
            <span key={w} className="inline-block bg-linear-to-b from-white to-orchid-300 bg-clip-text text-transparent">
              {w}
            </span>
          ))}
        </h2>
        <p data-reveal className="mx-auto mt-10 max-w-2xl text-center text-lg leading-relaxed text-white/70">
          Your money is held until the work is proven, then it&apos;s paid. That&apos;s the whole idea behind Vendly.
        </p>

        <ul data-reveal-group className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {trust.items.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <li key={item.title} className="rounded-3xl border border-white/10 bg-white/4 p-6 backdrop-blur-sm transition-colors hover:border-orchid-500/50 hover:bg-white/7">
                <span className="grid size-11 place-items-center rounded-2xl bg-brand">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-6 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
