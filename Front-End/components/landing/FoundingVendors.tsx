import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { founding, VENDOR_SIGNUP_HREF } from "./content";
import PhoneFrame from "./phone/PhoneFrame";
import VendorDashboardScreen from "./phone/screens/VendorDashboardScreen";

export default function FoundingVendors() {
  return (
    <section id="vendors" aria-labelledby="founding-title" className="relative isolate scroll-mt-24 overflow-hidden bg-plum-950 py-24 text-white sm:py-32">
      <div aria-hidden="true" className="landing-glow [pointer-events:none] absolute -right-40 top-10 -z-10 size-[560px] rounded-full bg-[#A84AB0]/30 blur-[130px]" />
      {/* Oversized mark as a backdrop */}
      <div aria-hidden="true" data-parallax="0.25" className="[pointer-events:none] absolute -left-24 bottom-0 -z-10 opacity-7">
        <LogoMark size={420} tone="dark" />
      </div>

      <div className="mx-auto grid max-w-[1240px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div data-reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orchid-300">{founding.eyebrow}</p>
          <h2 id="founding-title" className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-6xl">
            {founding.title}
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">{founding.body}</p>
          <ul className="mt-8 flex flex-wrap gap-3">
            {founding.perks.map((perk) => (
              <li key={perk} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold">
                <BadgeCheck className="size-4 text-orchid-300" />
                {perk}
              </li>
            ))}
          </ul>
          <Link
            href={VENDOR_SIGNUP_HREF}
            data-magnetic
            className="group mt-10 inline-flex items-center gap-3 rounded-full bg-white px-7 py-4 text-base font-bold text-plum-900 transition-colors hover:bg-blush-100"
          >
            Become a founding vendor
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        <div data-reveal className="mx-auto">
          <PhoneFrame width={290} label="The Vendly vendor dashboard: new requests, upcoming bookings, held earnings and rental stock">
            <VendorDashboardScreen />
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}
