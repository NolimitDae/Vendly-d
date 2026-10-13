"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Container from "@/app/_components/Container";
import Logo from "@/components/brand/Logo";
import { nav, VENDOR_SIGNUP_HREF } from "@/components/landing/content";
import StoreBadges from "@/components/landing/StoreBadges";
import { cn } from "@/lib/utils";

// Social icons are hidden until Vendly has real accounts to link to.
const columns = [
  {
    title: "Explore",
    links: nav.map((item) => ({ name: item.label, href: `/#${item.hash}` })),
  },
  {
    title: "Vendors",
    links: [
      { name: "List your business free", href: VENDOR_SIGNUP_HREF },
      { name: "Log in", href: "/login" },
    ],
  },
  {
    title: "Support",
    links: [
      { name: "Contact us", href: "/contact-us" },
      { name: "Privacy policy", href: "/privacy" },
      { name: "Terms & conditions", href: "/terms" },
    ],
  },
];

export default function Footer() {
  const isHome = usePathname() === "/";

  return (
    // On the home page the footer continues the page's deep plum; elsewhere it follows the site theme.
    <footer className={cn(isHome && "dark bg-plum-950")}>
      <Container className="py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-6">
            <Logo variant="stacked" size={56} className="dark:hidden" />
            <Logo variant="stacked" tone="dark" size={56} className="hidden dark:inline-flex" />
            <p className="max-w-[320px] text-base leading-relaxed text-ink-600 dark:text-white/70">
              The marketplace for booking trusted event vendors, with every payment protected until the job is done.
            </p>
            <StoreBadges tone={isHome ? "dark" : "light"} className="dark:[&>div]:border-white/15" />
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-plum-500 dark:text-orchid-300">{col.title}</h3>
                <ul className="mt-6 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.name}>
                      <Link href={link.href} className="text-base text-plum-900 transition-colors hover:text-orchid-500 dark:text-white dark:hover:text-orchid-300">
                        {link.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Container>
      <p className="bg-brand px-2.5 py-4 text-center text-sm text-white">© 2026 Vendly. All rights reserved.</p>
    </footer>
  );
}
