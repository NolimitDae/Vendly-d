"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import AddOnsLibrary from "@/components/addons/AddOnsLibrary";

export default function VendorAddOnsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
      <AddOnsLibrary />
    </Suspense>
  );
}
