"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Truck } from "lucide-react";
import { toast } from "react-toastify";
import TravelFeeFields, { emptyTravelFee, travelFeeBody, travelFeeError, travelFeeFrom, type TravelFeeValue } from "@/components/listing/TravelFeeFields";
import { RentalsService, errorMessage } from "@/service/rentals/rentals.service";

/** The vendor's delivery fee on rental orders they deliver: one setting for all their items. */
export default function RentalDeliveryFee() {
  const [value, setValue] = useState<TravelFeeValue>(emptyTravelFee());
  const [hasAddress, setHasAddress] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    RentalsService.deliveryFee()
      .then((r) => {
        if (!r.data?.success) return;
        setValue(travelFeeFrom(r.data.data));
        setHasAddress(!!r.data.data.has_business_address);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    const problem = travelFeeError(value);
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      const res = await RentalsService.saveDeliveryFee(travelFeeBody(value));
      if (res.data?.success === false) throw new Error(res.data.message);
      setValue(travelFeeFrom(res.data.data));
      toast.success(value.enabled ? "Delivery fee saved" : "Delivery fee turned off");
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the delivery fee"));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;
  return (
    <section aria-labelledby="rental-delivery" className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 mb-5 space-y-3">
      <h2 id="rental-delivery" className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Truck className="w-4 h-4 text-primary" aria-hidden /> Delivery fee
      </h2>
      {!hasAddress && (
        <p className="text-sm rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-3 py-2">
          Delivery miles are measured from your business address. <Link href="/vendor/profile" className="underline font-medium">Add it in your profile</Link> first.
        </p>
      )}
      <TravelFeeFields rentals value={value} onChange={setValue} />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save delivery fee
      </button>
    </section>
  );
}
