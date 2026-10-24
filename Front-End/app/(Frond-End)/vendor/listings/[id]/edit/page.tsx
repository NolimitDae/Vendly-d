"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { toast } from "react-toastify";
import { Upload, X, Loader2, ArrowLeft, CalendarX, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import CategoryCombobox from "@/components/listing/CategoryCombobox";
import LocationField, { appendPlace, type PickedPlace } from "@/components/listing/LocationField";
import type { PickerCategory } from "@/lib/categories";
import PackageQuantityFields, { appendLimits, limitsError, type QuantityLimits } from "@/components/addons/PackageQuantityFields";
import PackageDetailsFields, { appendPackageDetails, emptyPackageDetails, packageDetailsError, packageDetailsFrom, type PackageDetails } from "@/components/listing/PackageDetailsFields";
import PackageAddOns, { emptyPackageAddOns, savePackageAddOns, type PackageAddOnsValue } from "@/components/addons/PackageAddOns";
import { apiError } from "@/service/contracts/contracts.service";
import { dateOnly } from "@/lib/date-only";

interface BlockedDate {
  id: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Availability management
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockingDates, setBlockingDates] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Existing images from backend (full URLs)
  const [existingImages, setExistingImages] = useState<string[]>([]);
  // New files the user picks
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);

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
  const [limits, setLimits] = useState<QuantityLimits>({ min: "", max: "" });
  const [addOns, setAddOns] = useState<PackageAddOnsValue>(emptyPackageAddOns());
  const [details, setDetails] = useState<PackageDetails>(emptyPackageDetails());

  const fetchBlockedDates = async () => {
    try {
      const res = await MarketplaceService.getBlockedDates(id);
      if (res.data?.success) setBlockedDates(res.data.data ?? []);
    } catch { /* silent */ }
  };

  useEffect(() => {
    Promise.all([
      MarketplaceService.getCategories(),
      VendorListingService.getOne(id),
    ]).then(([catRes, listingRes]) => {
      if (catRes.data?.success) setCategories(catRes.data.data);

      if (listingRes.data?.success) {
        const l = listingRes.data.data;
        setExistingImages(l.images ?? []);
        setForm({
          title: l.title ?? "",
          description: l.description ?? "",
          price: String(l.price ?? ""),
          price_unit: l.price_unit ?? "fixed",
          payment_plan: l.payment_plan ?? l.effective_payment_plan ?? "FULL_ON_ACCEPT",
          availability: l.availability ?? "",
          delivery_time: l.delivery_time ? String(l.delivery_time) : "",
          category_id: l.category_id ?? l.category?.id ?? "",
          sub_category_id: l.sub_category_id ?? l.sub_category?.id ?? "",
          tags: Array.isArray(l.tags) ? l.tags.join(", ") : (l.tags ?? ""),
        });
        setPlace({ label: l.location ?? "", lat: l.lat ?? undefined, lng: l.lng ?? undefined });
        setRadius(l.service_radius_miles ?? null);
        setLimits({ min: l.min_quantity ? String(l.min_quantity) : "", max: l.max_quantity ? String(l.max_quantity) : "" });
        setDetails(packageDetailsFrom(l));
      } else {
        toast.error("Listing not found");
        router.push("/vendor/listings");
      }
    }).catch(() => {
      toast.error("Failed to load listing");
      router.push("/vendor/listings");
    }).finally(() => setPageLoading(false));

    fetchBlockedDates();
  }, [id]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const slots = 10 - existingImages.length - newImages.length;
    const picked = Array.from(files).slice(0, slots);
    setNewImages((prev) => [...prev, ...picked]);
    picked.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) =>
        setNewPreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeExisting = (i: number) =>
    setExistingImages((prev) => prev.filter((_, idx) => idx !== i));

  const removeNew = (i: number) => {
    setNewImages((prev) => prev.filter((_, idx) => idx !== i));
    setNewPreviews((prev) => prev.filter((_, idx) => idx !== i));
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
    const detailsProblem = packageDetailsError(details);
    if (detailsProblem) {
      toast.error(detailsProblem);
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      // empty category values clear what was there
      Object.entries(form).forEach(([k, v]) => { if (v || k === "category_id" || k === "sub_category_id") fd.append(k, v); });
      appendPlace(fd, place, radius, true);
      appendLimits(fd, form.price_unit, limits, true);
      appendPackageDetails(fd, details, true);

      // the current photos the vendor kept (the rest are deleted); new ones are added after them
      fd.append("keep_images", JSON.stringify(existingImages));
      newImages.forEach((img) => fd.append("images", img));

      const res = await VendorListingService.update(id, fd);
      if (res.data?.success) {
        try {
          await savePackageAddOns(id, addOns, true);
        } catch (err) {
          toast.error(`Listing saved, but the add-ons weren't: ${apiError(err, (err as Error)?.message || "please try again")}`);
          return;
        }
        toast.success("Listing updated!");
        router.push("/vendor/listings");
      } else {
        toast.error(res.data?.message || "Failed to update listing");
      }
    } catch (err) {
      // e.g. "A published package needs at least one photo."
      toast.error(apiError(err, "Failed to update listing"));
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleBlockDates = async () => {
    if (!blockStart || !blockEnd) return toast.error("Select start and end dates");
    if (new Date(blockStart) > new Date(blockEnd)) return toast.error("Start must be before end");
    setBlockingDates(true);
    try {
      const res = await VendorListingService.blockDates(id, {
        start_date: blockStart,
        end_date: blockEnd,
        reason: blockReason || undefined,
      });
      if (res.data?.success) {
        toast.success("Dates blocked");
        setBlockStart(""); setBlockEnd(""); setBlockReason("");
        fetchBlockedDates();
      }
    } catch {
      toast.error("Failed to block dates");
    } finally {
      setBlockingDates(false);
    }
  };

  const handleUnblock = async (blockId: string) => {
    setRemovingId(blockId);
    try {
      const res = await VendorListingService.unblockDates(blockId);
      if (res.data?.success) {
        toast.success("Dates unblocked");
        fetchBlockedDates();
      }
    } catch {
      toast.error("Failed to unblock dates");
    } finally {
      setRemovingId(null);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalImages = existingImages.length + newImages.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/vendor/listings"
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition text-sm dark:text-gray-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Edit Listing</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Images */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Photos</h2>
            {/* Existing images */}
            {existingImages.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {existingImages.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                    <Image src={src} alt="" fill className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => removeExisting(i)}
                      aria-label="Remove photo"
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center justify-center transition"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* New image previews */}
            {newImages.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {newPreviews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                    <Image src={src} alt="" fill className="object-cover" />
                    <button
                      type="button"
                      onClick={() => removeNew(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {totalImages < 10 && (
              <div
                className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-primary transition"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
              >
                <Upload className="w-7 h-7 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {totalImages > 0 ? "Add more photos" : "Drop images here or click to upload"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {10 - totalImages} slot{10 - totalImages !== 1 ? "s" : ""} remaining
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
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

          <PackageAddOns listingId={id} value={addOns} onChange={setAddOns} />

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
            <Link
              href="/vendor/listings"
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>

        {/* Availability management (outside form) */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <CalendarX className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Block Unavailable Dates</h2>
          </div>

          {/* Existing blocked dates */}
          {blockedDates.length > 0 && (
            <div className="space-y-2">
              {blockedDates.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm">
                  <span className="text-red-700 dark:text-red-300 font-medium">
                    {dateOnly(b.start_date).toLocaleDateString()} – {dateOnly(b.end_date).toLocaleDateString()}
                    {b.reason && <span className="ml-2 text-red-400 font-normal">({b.reason})</span>}
                  </span>
                  <button
                    onClick={() => handleUnblock(b.id)}
                    disabled={removingId === b.id}
                    className="text-red-500 hover:text-red-700 transition"
                  >
                    {removingId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new block */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Start Date</label>
              <input
                type="date"
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">End Date</label>
              <input
                type="date"
                value={blockEnd}
                onChange={(e) => setBlockEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="col-span-2">
              <input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Reason (optional, e.g. Holiday)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <button
            onClick={handleBlockDates}
            disabled={blockingDates || !blockStart || !blockEnd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
          >
            {blockingDates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Block Dates
          </button>
        </div>
      </div>
    </div>
  );
}
