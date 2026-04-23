import AppBackground from "../../components/landing-page/AppBackground";
import HomeScrollToHash from "../../components/landing-page/HomeScrollToHash";
import GrowBusiness from "../../components/landing-page/GrowBusiness/GrowBusiness";
import HeroSection from "../../components/landing-page/Hero/HeroSection";
import ConnectPeople from "../../components/landing-page/connect-people/ConnectPeople";
import PlatformWork from "../../components/landing-page/platform/PlatformWork";
import ServiceOverview from "../../components/landing-page/service-overview/ServiceOverview";
import WhyChoose from "../../components/landing-page/why-choose/WhyChoose";
import Customers from "../../components/landing-page/customers/Customers";
import ZeroHassle from "../../components/landing-page/zero-hassle/ZeroHassle";


export default function Home() {
  return (
    <div className="">
      <HomeScrollToHash />
      <AppBackground>
        <div id="home" className="scroll-mt-28">
          <HeroSection />
        </div>
      </AppBackground>
      <section id="about" className="scroll-mt-28">
        <ConnectPeople />
      </section>
      <div className="bg-[#FAFAFA]">
        <section id="how-it-works" className="scroll-mt-28">
          <PlatformWork />
        </section>
      </div>
      <section id="services" className="scroll-mt-28">
        <ServiceOverview />
      </section>
      <div className="bg-[#FAFAFA] dark:bg-background">
        <WhyChoose />
      </div>
      <GrowBusiness />
      <div className="bg-[#FAFAFA]">
        <Customers />
      </div>
      <div className="dark:bg-blackColor">
        <ZeroHassle />
      </div>
    </div>
  );
}
