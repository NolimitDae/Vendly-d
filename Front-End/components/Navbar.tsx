"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HiOutlineMenu, HiX } from "react-icons/hi";
import Image from "next/image";

import { cn } from "@/lib/utils";
import Container from "@/app/_components/Container";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { ThemeToggle } from "@/components/landing-page/theme/ThemeToggle";

const menuItems = [
  { en: "Home", href: "/", hash: "home" },
  { en: "About Us", href: "/#about", hash: "about" },
  { en: "How It Works", href: "/#how-it-works", hash: "how-it-works" },
  { en: "Services", href: "/#services", hash: "services" },
] as const;

function scrollToSection(hash: string) {
  if (hash === "home") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.replaceState(null, "", "/");
    return;
  }
  const el = document.getElementById(hash);
  el?.scrollIntoView({ behavior: "smooth" });
  window.history.replaceState(null, "", `/#${hash}`);
}

export default function Navbar() {
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === "dark";

  const [menuOpen, setMenuOpen] = useState(false);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const update = () => setHash(typeof window !== "undefined" ? window.location.hash : "");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    itemHash: string,
  ) => {
    if (pathname !== "/") return;
    e.preventDefault();
    scrollToSection(itemHash);
    setHash(itemHash === "home" ? "" : `#${itemHash}`);
    setMenuOpen(false);
  };

  const linkIsActive = (itemHash: string) => {
    if (pathname !== "/") return false;
    if (itemHash === "home") {
      return hash === "" || hash === "#" || hash === "#home";
    }
    return hash === `#${itemHash}`;
  };

  return (
    <Container className="mt-4 relative z-50">
      <div className={cn("flex justify-between items-center p-3 md:p-4 rounded-full nav_container")}>
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/site_logo.png" alt="logo" width={50} height={50} className="w-8 h-8 md:w-12 md:h-12" />
          <span className=" bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent text-lg md:text-2xl font-bold">Vendly</span>
        </Link>

        {/* Desktop Menu */}
        <nav className="hidden lg:flex space-x-8 text-base">
          {menuItems.map((item) => {
            const isActive = linkIsActive(item.hash);

            return (<Link
              key={item.hash}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.hash)}
              className={cn(
                "hover:text-purpleColor transition text-lg dark:text-white",
                isActive
                  ? "text-blackColor dark:text-white font-medium"
                  : "text-descriptionColor",
              )}
            >
              {item.en}
            </Link>)
          })}
        </nav>

        {/* Right: Language, Auth Buttons */}
        <div className="flex justify-end items-center space-x-[14px]">
          <ThemeToggle />
          <Link
            href="#"
            className="hidden lg:flex gradient-bg text-white font-medium cursor-pointer  px-9 py-3.5 rounded-full text-lg"
          >
            Get App Now
          </Link>
          {/* Mobile Menu Toggle */}
          <div className="flex justify-center items-center lg:hidden">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-white text-2xl cursor-pointer"
            >
              {menuOpen ? <HiX className="text-violet-500" /> : <HiOutlineMenu className="text-violet-500" />}
            </button>
          </div>
        </div>


      </div>

      {/* Mobile Menu Content */}
      <div
        className={cn(
          "lg:hidden fixed top-0 right-0 w-full bg-blackColor/20 backdrop-blur-xs h-screen    space-y-3 z-50 transform transition-transform duration-300 ease-in-out",
          menuOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className={cn("w-[80%]  absolute top-0 p-4 right-0 h-full  max-w-[320px] bg-white dark:bg-blackColor/20")}>
          <div className="flex w-full justify-between items-center mb-2">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/site_logo.png" alt="logo" width={50} height={50} />
              <span className="bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent text-lg md:text-2xl font-bold">Vendly</span>
            </Link>
            <button
              aria-label="close-menu"
              className="absolute top-4 right-4 z-10 text-white "
              onClick={() => setMenuOpen(false)}
            >
              <HiX className="text-2xl text-violet-500" />
            </button>
          </div>

          {menuItems.map((item) => {
            const isActive = linkIsActive(item.hash);

            return (
              <Link
                key={item.hash}
                href={item.href}
                className={cn(
                  "block text-base py-2 dark:text-white",
                  isActive
                    ? "text-blackColor font-medium"
                    : "text-descriptionColor",
                )}
                onClick={(e) => handleNavClick(e, item.hash)}
              >
                {item.en}
              </Link>
            )
          })}
          <div className="flex items-center justify-between">
            <Link
              href="#"
              className="gradient-bg text-white font-medium cursor-pointer  px-9 py-3.5 rounded-full text-lg"
            >
              Get App Now
            </Link>

          </div>
        </div>

      </div>
    </Container>
  );
}
