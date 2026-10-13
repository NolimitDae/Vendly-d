import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Logo from "@/components/brand/Logo";
import { VENDOR_SIGNUP_HREF } from "./content";
import StoreBadges from "./StoreBadges";

export default function FinalCta() {
  return (
    <section aria-labelledby="final-title" className="bg-blush-50 px-5 pb-24 sm:px-8 sm:pb-32 dark:bg-plum-950">
      <div
        data-reveal
        className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-[2.5rem] bg-brand px-6 py-20 text-center text-white sm:px-12 sm:py-24"
      >
        <div aria-hidden="true" className="landing-glow [pointer-events:none] absolute -top-40 left-1/2 -z-10 size-[600px] -translate-x-1/2 rounded-full bg-white/20 blur-[120px]" />
        <Logo variant="mark" tone="dark" size={52} className="mx-auto" />
        <h2 id="final-title" className="mx-auto mt-8 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-6xl">
          Be on Vendly from day one
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/80">
          List your business free today and launch with a Founding Vendor badge. Booking an event? The app is coming soon.
        </p>
        <div className="mt-10 flex flex-col items-center gap-8">
          <Link
            href={VENDOR_SIGNUP_HREF}
            data-magnetic
            className="group inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-base font-bold text-plum-900 shadow-xl transition-colors hover:bg-blush-100"
          >
            List your business free
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <StoreBadges className="justify-center" />
        </div>
      </div>
    </section>
  );
}
