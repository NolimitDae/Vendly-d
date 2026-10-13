import { Armchair, Building2, Camera, Flower2, Music, Sparkles, UtensilsCrossed } from "lucide-react";
import { categories } from "./content";
import SectionHeading from "./SectionHeading";

const ICONS = [Sparkles, Flower2, Music, UtensilsCrossed, Armchair, Camera, Building2];

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
        <ul data-reveal-group className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          {categories.map((c, i) => {
            const Icon = ICONS[i];
            return (
              <li
                key={c.name}
                className="group flex flex-col items-start gap-6 rounded-3xl border border-plum-900/8 bg-white p-5 transition-[translate,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-orchid-500/40 hover:shadow-[0_20px_40px_-20px_rgba(122,42,130,0.45)] lg:items-center lg:text-center dark:bg-white/5 dark:border-white/10 dark:hover:border-orchid-500/60"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-blush-100 text-plum-700 transition-colors group-hover:bg-brand group-hover:text-white dark:bg-white/10 dark:text-orchid-300 dark:group-hover:bg-brand dark:group-hover:text-white">
                  <Icon className="size-6" strokeWidth={1.6} />
                </span>
                <span className="text-sm font-bold leading-snug text-plum-900 dark:text-white">{c.name}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Duplicated list so the marquee loops seamlessly; hidden from screen readers (the grid above says it all). */}
      <div aria-hidden="true" className="mt-14 flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="landing-marquee flex shrink-0 gap-3 pr-3">
          {[...services, ...services].map((s, i) => (
            <span key={i} className="whitespace-nowrap rounded-full border border-plum-900/10 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 dark:bg-white/5 dark:text-white/70 dark:border-white/10">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
