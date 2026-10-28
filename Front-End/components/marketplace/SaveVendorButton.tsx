"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { whoAmI } from "@/lib/currentUser";
import { isLoggedIn } from "@/lib/session";
import { SavedVendorsService } from "@/service/savedVendors/savedVendors.service";

/** The heart on a vendor's shop: signed-in customers save the vendor to Favorites (not on their own shop). */
export default function SaveVendorButton({ vendorId, className }: { vendorId: string; className?: string }) {
  const [isCustomer, setIsCustomer] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) return;
    let live = true;
    whoAmI().then((me) => {
      if (!live || !(me.type === "CUSTOMER" || me.type === "CLIENT") || me.id === vendorId) return;
      setIsCustomer(true);
      SavedVendorsService.getSavedIds()
        .then((res) => {
          if (live && res.data?.success && Array.isArray(res.data.data)) setSaved(res.data.data.includes(vendorId));
        })
        .catch(() => {});
    });
    return () => {
      live = false;
    };
  }, [vendorId]);

  if (!isCustomer) return null;

  const toggle = async () => {
    setBusy(true);
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) {
        await SavedVendorsService.remove(vendorId);
        toast.success("Removed from favorites");
      } else {
        await SavedVendorsService.save(vendorId);
        toast.success("Saved to your favorites");
      }
    } catch {
      setSaved(wasSaved);
      toast.error("Could not update favorites");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? "Remove from favorites" : "Save vendor"}
      aria-pressed={saved}
      title={saved ? "Remove from favorites" : "Save vendor"}
      className={cn(
        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition border",
        saved
          ? "bg-red-500 border-red-500 text-white"
          : "border-gray-200 dark:border-gray-700 text-gray-400 hover:border-red-400 hover:text-red-500",
        className,
      )}
    >
      <Heart className={cn("w-5 h-5", saved && "fill-current")} />
    </button>
  );
}
