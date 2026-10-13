import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, pricing } from "./content";
import SectionHeading from "./SectionHeading";

export default function Pricing() {
  const { vendorPrice, feePercent } = pricing.example;
  const fee = (vendorPrice * feePercent) / 100;
  const plans = [
    { ...pricing.vendors, featured: false },
    { ...pricing.bookers, featured: true },
  ];

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 bg-blush-50 py-24 sm:py-32">
      <div className="mx-auto max-w-[1080px] px-5 sm:px-8">
        <SectionHeading
          id="pricing-title"
          eyebrow="Pricing"
          title="Free to list. Simple to book."
          body="Vendly only earns when a booking happens, and never by taking a cut of the vendor's price."
        />

        <div data-reveal-group className="mt-16 grid gap-6 md:grid-cols-2">
          {plans.map((p) => (
            <div
              key={p.title}
              className={cn(
                "flex flex-col rounded-[2rem] p-8 sm:p-10",
                p.featured ? "bg-plum-950 text-white shadow-[0_40px_80px_-30px_rgba(30,8,34,0.6)]" : "border border-plum-900/10 bg-white text-plum-900",
              )}
            >
              <p className={cn("text-sm font-semibold uppercase tracking-[0.2em]", p.featured ? "text-orchid-300" : "text-plum-500")}>{p.title}</p>
              <p className={cn("mt-6 text-7xl font-extrabold tracking-[-0.04em]", p.featured ? "text-white" : "text-brand")}>{p.price}</p>
              <p className={cn("mt-4 text-lg", p.featured ? "text-white/75" : "text-ink-600")}>{p.note}</p>
              <ul className="mt-8 space-y-3">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-center gap-3 font-medium">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", p.featured ? "bg-white/10" : "bg-blush-100")}>
                      <Check className="size-3.5" />
                    </span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div data-reveal className="mt-6 rounded-[2rem] border border-plum-900/10 bg-white p-8 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-plum-500">Example</p>
          <dl className="mt-6 grid gap-6 text-plum-900 sm:grid-cols-3">
            <div>
              <dt className="text-ink-600">Vendor&apos;s price</dt>
              <dd className="mt-1 text-3xl font-extrabold">{money(vendorPrice)}</dd>
            </div>
            <div>
              <dt className="text-ink-600">Vendly Protection fee ({feePercent}%)</dt>
              <dd className="mt-1 text-3xl font-extrabold">+ {money(fee)}</dd>
            </div>
            <div>
              <dt className="text-ink-600">You pay</dt>
              <dd className="mt-1 text-3xl font-extrabold text-brand">{money(vendorPrice + fee)}</dd>
            </div>
          </dl>
          <p className="mt-6 text-ink-600">
            The vendor receives the full {money(vendorPrice)}. Price, fee and total are always shown separately before you pay.
          </p>
        </div>
      </div>
    </section>
  );
}
