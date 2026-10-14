import Link from "next/link";
import { ArrowRight, Armchair, Building2, Camera, Flower2, Music, Sparkles, UtensilsCrossed } from "lucide-react";
import { categories, VENDOR_SIGNUP_HREF } from "./content";
import SectionHeading from "./SectionHeading";

const ICONS = [Sparkles, Flower2, Music, UtensilsCrossed, Armchair, Camera, Building2];

const card =
  "group relative overflow-hidden rounded-3xl border p-6 transition-[translate,box-shadow,border-color] duration-300 hover:-translate-y-1";

export default function Categories() {
  const services = categories.flatMap((c) => c.items);
  return (
    <section aria-labelledby="categories-title" className="overflow-hidden bg-blush-50 py-24 sm:py-32 dark:bg-plum-950">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHeading
          id="categories-title"
          eyebrow="Every vendor your event needs"
          title="From the glam to the gear, in one app"
          body="Seven categories at launch, each with verified vendors, real reviews and clear packages."
        />
        <ul data-reveal-group className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c, i) => {
            const Icon = ICONS[i];
            return (
              <li
                key={c.name}
                className={`${card} border-plum-900/8 bg-white hover:border-orchid-500/40 hover:shadow-[0_24px_48px_-24px_rgba(122,42,130,0.5)] dark:border-white/10 dark:bg-white/5 dark:hover:border-orchid-500/60`}
              >
                {/* Oversized faint icon in the corner */}
                <Icon
                  aria-hidden="true"
                  strokeWidth={1.2}
                  className="absolute -bottom-6 -right-6 size-28 text-plum-900/5 transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110 dark:text-white/5"
                />
                <div className="flex items-center gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-10px_rgba(122,42,130,0.8)]">
                    <Icon className="size-6" strokeWidth={1.7} />
                  </span>
                  <h3 className="text-lg font-bold leading-snug text-plum-900 dark:text-white">{c.name}</h3>
                </div>
                <p className="relative mt-4 text-sm leading-relaxed text-ink-600 dark:text-white/70">{c.items.join(" · ")}</p>
              </li>
            );
          })}
          <li className={`${card} flex flex-col justify-between border-transparent bg-plum-950 text-white dark:bg-plum-900`}>
            <p className="text-lg font-bold leading-snug">Your category?</p>
            <Link
              href={VENDOR_SIGNUP_HREF}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-orchid-300 transition-colors hover:text-white"
            >
              List your business free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </li>
        </ul>
      </div>

      {/* Duplicated list so the marquee loops seamlessly; hidden from screen readers (the grid above says it all). */}
      <div aria-hidden="true" className="landing-marquee-track mt-14 flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="landing-marquee flex shrink-0 gap-3 pr-3">
          {[...services, ...services].map((s, i) => (
            <span key={i} data-dup={i >= services.length ? "" : undefined} className="whitespace-nowrap rounded-full border border-plum-900/10 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
