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

export default function Home() {
  return (
    <main>
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
