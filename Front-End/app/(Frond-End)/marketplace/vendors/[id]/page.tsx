"use client";

import { useParams } from "next/navigation";
import VendorShop from "@/components/marketplace/VendorShop";

export default function VendorProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <VendorShop idOrHandle={id} />;
}
