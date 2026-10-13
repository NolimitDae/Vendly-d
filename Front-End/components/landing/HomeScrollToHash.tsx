"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Scrolls to `#id` when the home page loads with a hash (direct URL or client navigation). */
export default function HomeScrollToHash() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;
    const id = window.location.hash.slice(1);
    if (!id || id === "home") return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    });
  }, [pathname]);

  return null;
}
