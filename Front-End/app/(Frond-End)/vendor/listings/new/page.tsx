"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { toast } from "react-toastify";
import { Upload, X, Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import CategoryCombobox from "@/components/listing/CategoryCombobox";
import LocationField, { appendPlace, type PickedPlace } from "@/components/listing/LocationField";
import ServiceAtField from "@/components/listing/ServiceAtField";
import TravelFeeFields, { appendTravelFee, emptyTravelFee, travelFeeError, travelFeeFrom, type TravelFeeValue } from "@/components/listing/TravelFeeFields";
import { offersTravelFee } from "@/lib/travel-fee";
import type { ServiceAt } from "@/lib/booking-tracker";
import type { PickerCategory } from "@/lib/categories";
import { SubscriptionService } from "@/service/subscription/subscription.service";
import PackageQuantityFields, { appendLimits, limitsError, type QuantityLimits } from "@/components/addons/PackageQuantityFields";
import PackageDetailsFields, { appendPackageDetails, emptyPackageDetails, packageDetailsError, type PackageDetails } from "@/components/listing/PackageDetailsFields";
import PackageAddOns, { emptyPackageAddOns, savePackageAddOns, type PackageAddOnsValue } from "@/components/addons/PackageAddOns";
import PackageCustomizationsFields, { emptyCustomizations, saveCustomizations, type PackageCustomizationsValue } from "@/components/listing/PackageCustomizationsFields";
import DosDontsFields from "@/components/listing/DosDontsFields";
import { appendDosDonts, customizationsError, dosDontsError, emptyDosDonts, type DosDonts } from "@/lib/package-options";
import { apiError } from "@/service/contracts/contracts.service";
import LicenceNotice from "@/components/vendor/LicenceNotice";

export default function NewListingPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [planGateChecked, setPlanGateChecked] = useState(false);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    price_unit: "fixed",
    payment_plan: "FULL_ON_ACCEPT",
    availability: "",
    delivery_time: "",
    category_id: "",
    sub_category_id: "",
    tags: "",
  });
  const [place, setPlace] = useState<PickedPlace>({ label: "" });
  const [radius, setRadius] = useState<number | null>(null);
  // where the service happens: at the customer's place, or they come to the vendor's business address
  const [serviceAt, setServiceAt] = useState<ServiceAt>("CUSTOMER_LOCATION");
  const [limits, setLimits] = useState<QuantityLimits>({ min: "", max: "" });
  const [addOns, setAddOns] = useState<PackageAddOnsValue>(emptyPackageAddOns());
  const [details, setDetails] = useState<PackageDetails>(emptyPackageDetails());
  const [customizations, setCustomizations] = useState<PackageCustomizationsValue>(emptyCustomizations());
  const [dosDonts, setDosDonts] = useState<DosDonts>(emptyDosDonts());
  // delivery / travel fee by distance: only when the vendor goes to the customer (not venues)
  const [travel, setTravel] = useState<TravelFeeValue>(emptyTravelFee());
  const travelOffered = offersTravelFee(serviceAt, categories.find((c) => c.id === form.category_id)?.name);

  useEffect(() => {
    // vendor plans aren't required until subscriptions launch
    if (process.env.NEXT_PUBLIC_REQUIRE_VENDOR_PLAN !== "true") {
      setPlanGateChecked(true);
      return;
    }
    SubscriptionService.getCurrentPlan()
      .then((res) => {
        if (res.data?.success && res.data.data) {
          const d = res.data.data;
          const status =
            d.vendorPlan?.payment_status ??
            d.vendorSubscriptionPlan?.payment_status ??
            d.subscription?.status ??
            null;
          const active = status === "PAID" || status === "ACTIVE";
          if (!active) {
            setPlanBlocked(true);
          }
        }
        // If success=false but not a hard 403, don't block (endpoint may not exist yet)
      })
      .catch((err: any) => {
        if (err?.response?.status === 403) {
          router.replace("/vendor/subscription?reason=no-plan");
        }
        // 404 or network error → endpoint not yet deployed, fail open
      })
      .finally(() => setPlanGateChecked(true));
  }, [router]);

  useEffect(() => {
    MarketplaceService.getCategories().then((res) => {
      if (res.data?.success) setCategories(res.data.data);
    });
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 10 - images.length);
    setImages((prev) => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (i: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.price) {
      toast.error("Title, description, and price are required");
      return;
    }
    const limitProblem = limitsError(form.price_unit, limits);
    if (limitProblem) {
      toast.error(limitProblem);
      return;
    }
    const detailsProblem = packageDetailsError(details) ?? dosDontsError(dosDonts) ?? customizationsError(customizations.drafts) ?? (travelOffered ? travelFeeError(travel) : null);
    if (detailsProblem) {
      toast.error(detailsProblem);
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      appendPlace(fd, place, radius, false);
      fd.append("service_at", serviceAt);
      appendLimits(fd, form.price_unit, limits, false);
      appendPackageDetails(fd, details, false);
      if (travelOffered) appendTravelFee(fd, travel, false);
      appendDosDonts(fd, dosDonts, false);
      images.forEach((img) => fd.append("images", img));

      const res = await VendorListingService.create(fd);
      if (res.data?.success) {
        const newId: string | undefined = res.data?.data?.id;
        if (newId) {
          try {
            await savePackageAddOns(newId, addOns, false);
          } catch (err) {
            // the package exists now: finish the add-ons on its edit page
            toast.error(`Listing created, but the add-ons weren't saved: ${apiError(err, (err as Error)?.message || "please try again")}`);
            router.push(`/vendor/listings/${newId}/edit`);
            return;
          }
          try {
            await saveCustomizations(newId, customizations, form.price_unit, false);
          } catch (err) {
            toast.error(`Listing created, but the customizations weren't saved: ${apiError(err, "please try again")}`);
            router.push(`/vendor/listings/${newId}/edit`);
            return;
          }
        }
        toast.success("Listing created!");
        router.push("/vendor/listings");
      } else {
        toast.error(res.data?.message || "Failed to create listing");
      }
    } catch {
      toast.error("Failed to create listing");
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Show gate block once we know they don't have an active plan
  if (planGateChecked && planBlocked) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-16 px-4 flex items-start justify-center">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Subscription Required</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You need an active subscription plan to create listings. Start with a free 14-day trial — no credit card required.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/vendor/subscription?reason=no-plan"
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition"
            >
              View Subscription Plans
            </Link>
            <Link
              href="/vendor/listings"
              className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Back to Listings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/vendor/listings" className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition text-sm dark:text-gray-400">
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Create New Listing</h1>

        <LicenceNotice />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Images */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Photos</h2>
            <div
              className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-primary transition"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Drop images here or click to upload</p>
              <p className="text-xs text-gray-400 mt-1">Up to 10 images</p>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </div>
            {previews.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4">
                {previews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                    <Image src={src} alt="" fill className="object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Basic info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Basic Info</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={255}
                placeholder="e.g. Professional Wedding Photography"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={5}
                placeholder="Describe your service in detail..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white resize-none"
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Pricing</h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="listing-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {form.price_unit === "person" ? "Price per person" : form.price_unit === "hour" ? "Price per hour" : form.price_unit === "day" ? "Price per day" : "Price"} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    id="listing-price"
                    type="number"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="w-40">
                <label htmlFor="listing-price-unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Per</label>
                <select
                  id="listing-price-unit"
                  value={form.price_unit}
                  onChange={(e) => set("price_unit", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-gray-900 dark:text-white"
                >
                  <option value="fixed">Fixed</option>
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="event">Event</option>
                  <option value="person">Person</option>
                </select>
              </div>
            </div>
            <PackageQuantityFields unit={form.price_unit} price={form.price} limits={limits} onChange={setLimits} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">How customers pay</label>
              <select
                value={form.payment_plan}
                onChange={(e) => set("payment_plan", e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-gray-900 dark:text-white"
              >
                <option value="FULL_ON_ACCEPT">Full payment when you accept</option>
                <option value="DEPOSIT_50">50% deposit, balance 7 days before</option>
                <option value="DEPOSIT_25">25% deposit, balance 14 days before</option>
                <option value="PAY_AFTER_SERVICE">Pay after the service</option>
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vendly holds the money until the job is done, then pays you.</p>
            </div>
          </div>

          <PackageDetailsFields value={details} onChange={setDetails} />

          <PackageCustomizationsFields value={customizations} onChange={setCustomizations} priceUnit={form.price_unit} />

          <PackageAddOns value={addOns} onChange={setAddOns} />

          <DosDontsFields value={dosDonts} onChange={setDosDonts} />

          {/* Category */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Category</h2>
            <CategoryCombobox
              categories={categories}
              categoryId={form.category_id}
              subCategoryId={form.sub_category_id}
              onChange={(category_id, sub_category_id) => setForm((prev) => ({ ...prev, category_id, sub_category_id }))}
            />
          </div>

          {/* Location */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Location</h2>
            <LocationField value={place} onChange={setPlace} radius={radius} onRadiusChange={setRadius} />
            <ServiceAtField value={serviceAt} onChange={setServiceAt} />
            {travelOffered && <TravelFeeFields value={travel} onChange={setTravel} />}
          </div>

          {/* Details */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Additional Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Delivery Time (days)</label>
                <input
                  type="number"
                  value={form.delivery_time}
                  onChange={(e) => set("delivery_time", e.target.value)}
                  min="1"
                  placeholder="e.g. 3"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Availability</label>
              <textarea
                value={form.availability}
                onChange={(e) => set("availability", e.target.value)}
                rows={2}
                placeholder="e.g. Mon-Fri 9am-6pm, weekends available"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tags (comma separated)</label>
              <input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="e.g. photography, wedding, outdoor"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Link href="/vendor/listings" className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save as Draft
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
