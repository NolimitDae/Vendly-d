import HomeScrollToHash from "@/components/landing/HomeScrollToHash";
import LandingMotion from "@/components/landing/motion/LandingMotion";
import Hero from "@/components/landing/Hero";
import Categories from "@/components/landing/Categories";
import HowItWorks from "@/components/landing/HowItWorks";
import Pricing from "@/components/landing/Pricing";
import FoundingVendors from "@/components/landing/FoundingVendors";
import Roles from "@/components/landing/Roles";
import Trust from "@/components/landing/Trust";
import Faq from "@/components/landing/Faq";
import FinalCta from "@/components/landing/FinalCta";
import { JsonLd, pageMetadata, SITE_URL } from "@/lib/seo";

export const metadata = pageMetadata({
  description:
    "Find and book trusted vendors, rentals and event planners for weddings, birthdays and parties. Compare packages and prices, chat with vendors and pay securely on Vendly.",
  path: "/",
});

/** Tells Google who runs the site (name, logo) and the site's name in results. */
const SITE_DATA = [
  { "@context": "https://schema.org", "@type": "Organization", name: "Vendly", url: SITE_URL, logo: `${SITE_URL}/icon.svg` },
  { "@context": "https://schema.org", "@type": "WebSite", name: "Vendly", alternateName: "Vendly Marketplace", url: `${SITE_URL}/` },
];

export default function Home() {
  return (
    <main>
      <JsonLd data={SITE_DATA} />
      <HomeScrollToHash />
      <LandingMotion />
      <Hero />
      <Categories />
      <HowItWorks />
      <Pricing />
      <FoundingVendors />
      <Roles />
      <Trust />
      <Faq />
      <FinalCta />
    </main>
  );
}
