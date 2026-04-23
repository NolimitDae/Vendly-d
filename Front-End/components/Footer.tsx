"use client";
import Link from "next/link";
import {
  FaFacebookF,
  FaLinkedinIn,
  FaLocationDot,
  FaPhone,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import { IoMdMail } from "react-icons/io";
import FacebookIcon from "@/icons/FacebookIcon";
import TwitterIcon from "@/icons/TwitterIcon";
import InstagramIcon from "@/icons/InstagramIcon";
import PinterestIcon from "@/icons/PinterestIcon";
import LinkedInIcon from "@/icons/LinkedInIcon";
import Container from "@/app/_components/Container";
import Image from "next/image";

const footerIcon = [
  { icon: <FacebookIcon /> },
  { icon: <TwitterIcon /> },
  { icon: <InstagramIcon /> },
  { icon: <PinterestIcon /> },
  { icon: <LinkedInIcon /> },
]
const navigationLinks = [
  { name: "Home", slug: "/" },
  { name: "About", slug: "/about" },
  { name: "How It Wroks", slug: "/how-it-works" },
  { name: "Services", slug: "/services" },
]

const partnerLinks = [
  { name: "My partners", slug: "#" }, {
    name: "Community", slug: "#"
  }, {
    name: "Clients", slug: "#"
  }
]

const supportLinks = [
  { name: "Contact me", slug: "#" }, {
    name: "Privacy Policy", slug: "#"
  }, {
    name: "Terms", slug: "#"
  }
]

export default function Footer() {
  return (
    <footer>
      <Container className="py-10 lg:pt-30 pb-10 lg:pb-20">
        <div className="flex flex-col lg:flex-row  space-y-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Image src="/site_logo.png" alt="logo" width={50} height={50} />
              <span className=" bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent text-2xl font-bold">Vendly</span>
            </div>
            <p className="text-base font-normal text-descriptionColor dark:text-white leading-[160%] max-w-[380px]">Explore the world with us! Find inspiration, plan adventures, and make unforgettable memories every journey.</p>
            <div className="flex items-center gap-[1.053rem]">
              {footerIcon.map((item, index) => (
                <Link
                  href="#"
                  key={index}
                  className={`w-[2.5rem] h-[2.5rem] rounded-full flex items-center justify-center border-[0.5px] border-borderColor hover:border-purpleOne dark:border-0 transition-all duration-300 
      ${index === 0 ? "bg-purpleOne text-white" : "bg-white dark:bg-[#CDC1FF1A]  text-blackColor dark:text-white"}`}
                >
                  {item.icon}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2 sm:space-y-6">
              <h3 className="text-lg sm:text-2xl font-semibold text-blackColor dark:text-white leading-[130%] capitalize">Navigation</h3>
              <ul className="space-y-1 sm:space-y-3">
                {navigationLinks.map((item, index) => (
                  <li key={index}>
                    <Link href={item.slug} className="text-sm sm:text-lg font-normal text-descriptionColor dark:text-white leading-[130%] hover:text-purpleOne">{item.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 sm:space-y-6">
              <h3 className="text-lg sm:text-2xl font-semibold text-blackColor dark:text-white leading-[130%] capitalize">Partners</h3>
              <ul className="space-y-1 sm:space-y-3">
                {partnerLinks.map((item, index) => (
                  <li key={index}>
                    <Link href={item.slug} className="text-sm sm:text-lg font-normal text-descriptionColor dark:text-white leading-[130%] hover:text-purpleOne">{item.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 sm:space-y-6">
              <h3 className="text-lg sm:text-2xl font-semibold text-blackColor dark:text-white leading-[130%] capitalize">Support</h3>
              <ul className="space-y-1 sm:space-y-3">
                {supportLinks.map((item, index) => (
                  <li key={index}>
                    <Link href={item.slug} className="text-sm sm:text-lg font-normal text-descriptionColor dark:text-white leading-[130%] hover:text-purpleOne">{item.name}</Link>
                  </li>
                ))}
              </ul>
            </div></div>
          <div>



          </div>
        </div>


      </Container>
      <p className="text-center text-sm font-normal gradient-bg text-white leading-[130%] px-2.5 py-3.5">Copyright © 2026 Vendly. All rights reserved.</p>
    </footer>
  );
}
