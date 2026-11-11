"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { whoAmI } from "@/lib/currentUser";

/** Where someone who isn't in their vendor account goes instead of a vendor page. */
export function homeFor(type: string | null): string {
  if (!type) return "/login";
  if (type === "ADMIN") return "/dashboard";
  if (type === "EVENT_PLANNER") return "/event-planner/profile";
  return "/bookings";
}

/**
 * Vendor pages are for the vendor account only: a customer (or a planner, or someone logged out) who
 * opens one is sent to their own pages instead of seeing vendor screens. The API refuses their data
 * either way; this keeps the vendor tools out of sight. Someone with a vendor role switches to it first.
 */
export default function VendorOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "vendor" | "away">("checking");

  useEffect(() => {
    let live = true;
    whoAmI().then((me) => {
      if (!live) return;
      if (me.type === "VENDOR") return setState("vendor");
      setState("away");
      router.replace(homeFor(me.type));
    });
    return () => {
      live = false;
    };
  }, [router]);

  if (state !== "vendor") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-7 h-7 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  return <>{children}</>;
}
